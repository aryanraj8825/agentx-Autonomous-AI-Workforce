import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { stepTask, approveNode, rejectNode, cancelTask, resetTask } from '../lib/engine';
import { buildWorkflow, classifyPrompt } from '../lib/workflow';
import { seedTasks, SEED_MEMORIES, SEED_INTEGRATIONS, SEED_NOTIFICATIONS } from '../lib/seed';
import { AGENTS } from '../lib/agents';

const Ctx = createContext(null);
const TICK_MS = 300;
const LS = 'agentx.';

const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(LS + k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(LS + k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

const ACTIVE = ['running', 'awaiting_approval'];

function init() {
  const now = Date.now();
  return {
    user: read('user', null), // set by login; token lives in localStorage
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    speed: read('speed', 1),
    tasks: seedTasks(now),
    memories: SEED_MEMORIES,
    integrations: SEED_INTEGRATIONS,
    notifications: SEED_NOTIFICATIONS,
    toasts: [],
    seq: 1,
    nextTaskNo: 1041,
    agentConfig: Object.fromEntries(
      Object.values(AGENTS).map((a) => [a.id, { model: a.model, temperature: a.temperature, maxRetries: a.maxRetries, enabled: true }]),
    ),
    settings: read('settings', {
      approval: { externalApi: true, fileWrite: true, email: true, codeExec: false },
      notifyDone: true,
      notifyApproval: true,
      density: 'comfortable',
      twoFactor: false,
    }),
  };
}

function pushToast(s, tone, text) {
  const id = `T${s.seq}`;
  return { ...s, seq: s.seq + 1, toasts: [...s.toasts.slice(-3), { id, tone, text }] };
}

function addNotice(s, n) {
  const id = `N${s.seq}`;
  return {
    ...s,
    seq: s.seq + 1,
    notifications: [{ id, kind: n.kind, text: n.text, taskId: n.taskId, ts: Date.now(), read: false }, ...s.notifications].slice(0, 40),
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'LOGIN':
      return { ...s, user: a.user };
    case 'LOGOUT':
      return { ...s, user: null };
    case 'SET_THEME':
      return { ...s, theme: a.theme };
    case 'SET_SPEED':
      return { ...s, speed: a.speed };

    case 'TICK': {
      let next = s;
      const tasks = s.tasks.map((t) => {
        if (!ACTIVE.includes(t.status)) return t;
        const { task, notices } = stepTask(t, a.dt, Date.now());
        notices.forEach((n) => {
          const wasApproval = n.kind === 'approval';
          next = addNotice(next, { kind: n.kind, text: n.text, taskId: n.taskId });
          if ((wasApproval && s.settings.notifyApproval) || (!wasApproval && s.settings.notifyDone))
            next = pushToast(next, wasApproval ? 'warn' : 'ok', n.text);
        });
        return task;
      });
      return { ...next, tasks };
    }

    case 'CREATE_TASK': {
      const id = `TSK-${s.nextTaskNo}`;
      const kind = a.kind || classifyPrompt(a.prompt);
      const now = Date.now();
      const task = {
        id,
        title: a.title || a.prompt.slice(0, 64),
        prompt: a.prompt,
        status: 'running',
        kind,
        createdAt: now,
        startedAt: now,
        finishedAt: null,
        progress: 0,
        options: a.options,
        attachments: a.attachments || [],
        nodes: buildWorkflow(kind, a.options),
        logs: [{ id: `${id}-L0`, ts: now, agent: 'supervisor', level: 'info', text: 'Task received.' }],
        messages: [],
        deliverables: [],
        evidence: [],
        metrics: { tokens: 0, cost: 0, durationMs: 0, retries: 0 },
      };
      return pushToast({ ...s, nextTaskNo: s.nextTaskNo + 1, tasks: [task, ...s.tasks] }, 'info', `${id} started`);
    }
    case 'APPROVE':
      return { ...s, tasks: s.tasks.map((t) => (t.id === a.taskId ? approveNode(t, a.nodeId) : t)) };
    case 'REJECT':
      return pushToast({ ...s, tasks: s.tasks.map((t) => (t.id === a.taskId ? rejectNode(t, a.nodeId) : t)) }, 'warn', 'Task stopped at approval');
    case 'CANCEL':
      return pushToast({ ...s, tasks: s.tasks.map((t) => (t.id === a.taskId ? cancelTask(t) : t)) }, 'warn', `${a.taskId} cancelled`);
    case 'RETRY':
      return pushToast({ ...s, tasks: s.tasks.map((t) => (t.id === a.taskId ? resetTask(t) : t)) }, 'info', `${a.taskId} restarted`);
    case 'DELETE_TASKS':
      return pushToast({ ...s, tasks: s.tasks.filter((t) => !a.ids.includes(t.id)) }, 'info', `${a.ids.length} task${a.ids.length > 1 ? 's' : ''} deleted`);

    case 'DISMISS_TOAST':
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    case 'TOAST':
      return pushToast(s, a.tone || 'info', a.text);
    case 'READ_NOTIFICATIONS':
      return { ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) };

    case 'MEMORY_ADD':
      return pushToast({ ...s, seq: s.seq + 1, memories: [{ id: `m${s.seq}`, pinned: false, uses: 0, createdAt: Date.now(), tags: [], ...a.memory }, ...s.memories] }, 'ok', 'Memory saved');
    case 'MEMORY_PIN':
      return { ...s, memories: s.memories.map((m) => (m.id === a.id ? { ...m, pinned: !m.pinned } : m)) };
    case 'MEMORY_DELETE':
      return pushToast({ ...s, memories: s.memories.filter((m) => m.id !== a.id) }, 'info', 'Memory deleted');

    case 'INTEGRATION_TOGGLE':
      return pushToast(
        { ...s, integrations: s.integrations.map((i) => (i.id === a.id ? { ...i, connected: a.connected, health: a.connected ? 'ok' : 'off', lastSync: a.connected ? Date.now() : null } : i)) },
        a.connected ? 'ok' : 'info',
        a.connected ? 'Integration connected' : 'Integration disconnected',
      );
    case 'AGENT_CONFIG':
      return { ...s, agentConfig: { ...s.agentConfig, [a.id]: { ...s.agentConfig[a.id], ...a.patch } } };
    case 'SETTINGS':
      return { ...s, settings: { ...s.settings, ...a.patch } };
    default:
      return s;
  }
}

export function AppStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const activeRef = useRef(false);
  const speedRef = useRef(state.speed);
  activeRef.current = state.tasks.some((t) => ACTIVE.includes(t.status));
  speedRef.current = state.speed;

  // Simulation clock. Skips work entirely when nothing is running.
  useEffect(() => {
    const id = setInterval(() => {
      if (activeRef.current) dispatch({ type: 'TICK', dt: TICK_MS * speedRef.current });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Persistence for small, user-owned state
  useEffect(() => write('user', state.user), [state.user]);
  useEffect(() => write('speed', state.speed), [state.speed]);
  useEffect(() => write('settings', state.settings), [state.settings]);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    try {
      localStorage.setItem('agentx.theme', state.theme);
    } catch {
      /* ignore */
    }
  }, [state.theme]);

  const api = useMemo(
    () => ({
      createTask: (payload) => dispatch({ type: 'CREATE_TASK', ...payload }),
      approve: (taskId, nodeId) => dispatch({ type: 'APPROVE', taskId, nodeId }),
      reject: (taskId, nodeId) => dispatch({ type: 'REJECT', taskId, nodeId }),
      cancel: (taskId) => dispatch({ type: 'CANCEL', taskId }),
      retry: (taskId) => dispatch({ type: 'RETRY', taskId }),
      deleteTasks: (ids) => dispatch({ type: 'DELETE_TASKS', ids }),
      toast: (text, tone) => dispatch({ type: 'TOAST', text, tone }),
      dismissToast: (id) => dispatch({ type: 'DISMISS_TOAST', id }),
      readNotifications: () => dispatch({ type: 'READ_NOTIFICATIONS' }),
      setTheme: (theme) => dispatch({ type: 'SET_THEME', theme }),
      setSpeed: (speed) => dispatch({ type: 'SET_SPEED', speed }),
      login: (user) => dispatch({ type: 'LOGIN', user }),
      logout: () => dispatch({ type: 'LOGOUT' }),
      addMemory: (memory) => dispatch({ type: 'MEMORY_ADD', memory }),
      pinMemory: (id) => dispatch({ type: 'MEMORY_PIN', id }),
      deleteMemory: (id) => dispatch({ type: 'MEMORY_DELETE', id }),
      toggleIntegration: (id, connected) => dispatch({ type: 'INTEGRATION_TOGGLE', id, connected }),
      configureAgent: (id, patch) => dispatch({ type: 'AGENT_CONFIG', id, patch }),
      updateSettings: (patch) => dispatch({ type: 'SETTINGS', patch }),
    }),
    [],
  );

  const value = useMemo(() => ({ state, ...api }), [state, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStoreProvider');
  return v;
};

/** Derived selectors */
export function useDerived() {
  const { state } = useApp();
  return useMemo(() => {
    const tasks = state.tasks;
    const active = tasks.filter((t) => ACTIVE.includes(t.status));
    const completed = tasks.filter((t) => t.status === 'completed');
    const finished = tasks.filter((t) => ['completed', 'failed', 'cancelled'].includes(t.status));
    // agents currently working: any node running
    const working = {};
    const current = {};
    active.forEach((t) =>
      t.nodes.forEach((n) => {
        if (n.status === 'running' || n.status === 'awaiting_approval') {
          working[n.agent] = (working[n.agent] || 0) + 1;
          current[n.agent] = { task: t, node: n };
        }
      }),
    );
    const tokens = tasks.reduce((a, t) => a + t.metrics.tokens, 0);
    const cost = tasks.reduce((a, t) => a + t.metrics.cost, 0);
    return {
      active,
      completed,
      working,
      current,
      tokens,
      cost,
      successRate: finished.length ? completed.length / finished.length : 0,
      awaiting: tasks.filter((t) => t.status === 'awaiting_approval'),
    };
  }, [state.tasks]);
}

export const useTask = (id) => {
  const { state } = useApp();
  return state.tasks.find((t) => t.id === id);
};

