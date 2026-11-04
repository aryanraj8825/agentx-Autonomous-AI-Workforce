import { buildWorkflow, classifyPrompt } from './workflow';
import { createEvidence, makeDeliverables } from './engine';

const DAY = 86_400_000;

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROMPTS = [
  'Research the top 10 AI startups in India and prepare a market report',
  'Compare pricing and features of the top 5 CRM tools for small teams',
  'Review recent papers on retrieval-augmented generation and summarise approaches',
  'Analyse the electric scooter market in Southeast Asia',
  'Build a competitor analysis for a note-taking app',
  'Summarise regulatory changes affecting fintech lending in 2026',
  'Compare managed vector databases on cost and latency',
  'Research hiring trends for full stack developers in India',
  'Review studies on spaced repetition and exam performance',
  'Map the competitive landscape for AI customer support tools',
  'Analyse pricing models of developer observability platforms',
  'Research EdTech startups focused on test preparation',
];

const TITLES = [
  'India AI startups market report',
  'CRM tools comparison',
  'RAG literature review',
  'Electric scooter market analysis',
  'Note-taking app competitors',
  'Fintech lending regulation brief',
  'Vector database comparison',
  'Full stack hiring trends',
  'Spaced repetition evidence review',
  'AI support tools landscape',
  'Observability pricing models',
  'Test-prep EdTech scan',
];

export function makeHistoricTask(i, now) {
  const r = rng(i * 97 + 13);
  const kind = classifyPrompt(PROMPTS[i % PROMPTS.length]);
  const nodes = buildWorkflow(kind, { autonomy: 'autonomous' });
  const createdAt = now - Math.floor(i * 0.55 * DAY + r() * 0.4 * DAY) - 3_600_000;
  const roll = r();
  const status = roll < 0.74 ? 'completed' : roll < 0.88 ? 'failed' : 'cancelled';
  const failAt = status === 'failed' ? 3 + Math.floor(r() * 3) : -1;
  let t0 = createdAt;
  let tokens = 0;
  let retries = 0;
  const outNodes = nodes.map((nd, idx) => {
    const dur = Math.round(nd.duration * (0.8 + r() * 0.7) * 6);
    const attempt = r() < 0.18 ? 2 : 1;
    retries += attempt - 1;
    const failed = idx === failAt;
    const skipped = failAt >= 0 && idx > failAt;
    const cancelled = status === 'cancelled' && idx >= 4;
    const st = failed ? 'failed' : skipped || cancelled ? 'cancelled' : 'completed';
    if (st === 'completed') tokens += Math.round(nd.tokens * (0.85 + r() * 0.5));
    const started = t0;
    t0 += dur;
    return { ...nd, status: st, progress: st === 'completed' ? 100 : failed ? 40 : 0, elapsed: dur, duration: dur, attempt, startedAt: started, finishedAt: t0 };
  });
  const id = `TSK-${1000 + 40 - i}`;
  const task = {
    id,
    title: TITLES[i % TITLES.length],
    prompt: PROMPTS[i % PROMPTS.length],
    status,
    kind,
    createdAt,
    startedAt: createdAt,
    finishedAt: t0,
    progress: status === 'completed' ? 100 : Math.round((outNodes.filter((x) => x.status === 'completed').length / outNodes.length) * 100),
    options: { formats: ['report', 'csv'], autonomy: 'autonomous', useMemory: true, tokenBudget: 60000, noFailures: true },
    attachments: [],
    nodes: outNodes,
    logs: [],
    messages: [],
    deliverables: [],
    evidence: [],
    metrics: { tokens, cost: tokens * 0.5e-6, durationMs: t0 - createdAt, retries },
  };
  const L = (agent, level, text, off) => task.logs.push({ id: `${id}-L${task.logs.length}`, ts: createdAt + off, agent, level, text });
  L('supervisor', 'info', 'Reading the objective and selecting agents.', 0);
  L('planner', 'success', 'Plan ready: 9 steps, 2 run in parallel.', 4000);
  if (status === 'completed') {
    L('reviewer', 'success', 'All claims verified against evidence.', t0 - createdAt - 2000);
    L('supervisor', 'success', 'Task complete. Deliverables are ready.', t0 - createdAt);
    task.evidence = createEvidence();
    task.deliverables = makeDeliverables(task);
  } else if (status === 'failed') {
    L('researcher', 'error', 'Search provider unavailable after 3 retries. Task stopped.', t0 - createdAt);
  } else {
    L('supervisor', 'warn', 'Cancelled by user.', t0 - createdAt);
  }
  return task;
}

export function seedTasks(now = Date.now()) {
  return Array.from({ length: 24 }, (_, i) => makeHistoricTask(i, now));
}

export const SEED_MEMORIES = [
  { id: 'm1', type: 'preference', title: 'Report style', text: 'Prefers an executive summary first, then findings as short bullets. Avoid long paragraphs.', tags: ['writing', 'format'], pinned: true, createdAt: Date.now() - 12 * DAY, uses: 14 },
  { id: 'm2', type: 'preference', title: 'Currency and region', text: 'Show money in USD with INR in brackets. Focus on the Indian market unless told otherwise.', tags: ['region', 'currency'], pinned: true, createdAt: Date.now() - 20 * DAY, uses: 9 },
  { id: 'm3', type: 'research', title: 'Funding data sources', text: 'Most reliable funding figures came from regulatory filings and two business databases. Press releases overstated rounds by 8–15%.', tags: ['funding', 'sources'], pinned: false, createdAt: Date.now() - 6 * DAY, uses: 5 },
  { id: 'm4', type: 'research', title: 'Pricing page patterns', text: 'About 40% of B2B AI vendors hide pricing behind a sales form. Mark these as "not public" instead of estimating.', tags: ['pricing'], pinned: false, createdAt: Date.now() - 4 * DAY, uses: 3 },
  { id: 'm5', type: 'history', title: 'India AI startups market report', text: 'Completed in 2m 41s using 38.4k tokens. Reviewer returned the draft once for a missing citation.', tags: ['run', 'TSK-1040'], pinned: false, createdAt: Date.now() - 1 * DAY, uses: 1 },
  { id: 'm6', type: 'history', title: 'Vector database comparison', text: 'Executor generated a CSV with latency and cost columns. User asked for a monthly cost estimate in the next run.', tags: ['run', 'csv'], pinned: false, createdAt: Date.now() - 3 * DAY, uses: 2 },
  { id: 'm7', type: 'research', title: 'Citation rule', text: 'Every numeric claim needs a source. Flag claims under 0.7 confidence in the report.', tags: ['quality'], pinned: true, createdAt: Date.now() - 30 * DAY, uses: 21 },
];

export const SEED_INTEGRATIONS = [
  { id: 'gemini', name: 'Gemini API', group: 'Models', desc: 'Reasoning and embeddings for every agent.', connected: true, health: 'ok', scopes: ['generate', 'embed'], icon: 'Sparkles', fields: ['API key'], lastSync: Date.now() - 120000 },
  { id: 'search', name: 'Web search', group: 'Tools', desc: 'Search API used by the Researcher.', connected: true, health: 'ok', scopes: ['search.read'], icon: 'Globe', fields: ['API key'], lastSync: Date.now() - 600000 },
  { id: 'mongodb', name: 'MongoDB', group: 'Data', desc: 'Tasks, workflows, logs and usage metrics.', connected: true, health: 'ok', scopes: ['read', 'write'], icon: 'Database', fields: ['Connection string'], lastSync: Date.now() - 30000 },
  { id: 'qdrant', name: 'Qdrant', group: 'Data', desc: 'Vector store for semantic memory.', connected: true, health: 'degraded', scopes: ['collections.read', 'points.write'], icon: 'Boxes', fields: ['URL', 'API key'], lastSync: Date.now() - 900000 },
  { id: 'redis', name: 'Redis', group: 'Data', desc: 'Job queue and transient workflow state.', connected: true, health: 'ok', scopes: ['queue'], icon: 'Layers', fields: ['URL'], lastSync: Date.now() - 20000 },
  { id: 'drive', name: 'Google Drive', group: 'Workspace', desc: 'Save deliverables to a shared folder.', connected: false, health: 'off', scopes: ['files.create'], icon: 'HardDrive', fields: ['OAuth'], lastSync: null },
  { id: 'slack', name: 'Slack', group: 'Workspace', desc: 'Post run summaries and approval requests.', connected: false, health: 'off', scopes: ['chat.write'], icon: 'MessageSquare', fields: ['OAuth'], lastSync: null },
  { id: 'github', name: 'GitHub', group: 'Workspace', desc: 'Read repositories for code review tasks.', connected: false, health: 'off', scopes: ['repo.read'], icon: 'Github', fields: ['Personal access token'], lastSync: null },
  { id: 'smtp', name: 'Email (SMTP)', group: 'Workspace', desc: 'Send reports to approved recipients.', connected: false, health: 'off', scopes: ['mail.send'], icon: 'Mail', fields: ['Host', 'Username', 'Password'], lastSync: null },
];

export const SEED_NOTIFICATIONS = [
  { id: 'nt1', kind: 'done', text: 'India AI startups market report is ready', taskId: 'TSK-1040', ts: Date.now() - 3_600_000, read: false },
  { id: 'nt2', kind: 'warn', text: 'Qdrant responded slowly (p95 1.8s)', taskId: null, ts: Date.now() - 8_000_000, read: false },
  { id: 'nt3', kind: 'fail', text: 'Fintech lending regulation brief failed at Researcher', taskId: 'TSK-1035', ts: Date.now() - 26 * 3_600_000, read: true },
];
