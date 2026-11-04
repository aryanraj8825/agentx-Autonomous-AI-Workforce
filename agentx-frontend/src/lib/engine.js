/**
 * Demo execution engine (pure functions).
 *
 * It mimics what the LangGraph backend does: it starts nodes whose dependencies
 * are complete (parallel where possible), pauses for human approval, retries
 * failed nodes with a changed strategy, lets the Reviewer send work back to the
 * Writer, and finally emits deliverables and evidence.
 *
 * To connect the real backend, drop this file and feed the same task shape from
 * WebSocket events (see README → "Connecting the backend").
 */
import { AGENTS } from './agents';
import { buildReport, buildCsv } from './reports';

const TOKEN_RATE_USD = 0.5 / 1_000_000; // blended $/token for the demo

const log = (t, now, agent, level, text) => {
  t.logs.push({ id: `${t.id}-L${t.logs.length}`, ts: now, agent, level, text });
};
const msg = (t, now, from, to, type, text, payload) => {
  t.messages.push({ id: `${t.id}-M${t.messages.length}`, ts: now, from, to, type, text, payload });
};

const START_LINES = {
  supervisor: 'Reading the objective and selecting agents',
  planner: 'Decomposing the goal into a dependency graph',
  researcher: 'Searching sources and extracting facts',
  analyst: 'Running comparison in the Python sandbox',
  executor: 'Generating files',
  writer: 'Composing the document',
  reviewer: 'Verifying claims against evidence',
};

const DONE_LINES = {
  n1: 'Objective understood. Activating planner, researcher, analyst, executor, writer and reviewer.',
  n2: 'Plan ready: 9 steps, 2 run in parallel.',
  n3: 'Collected 10 company profiles from 14 sources.',
  n4: 'Collected funding, product and pricing data from 11 sources.',
  n5: 'Comparison table built; 5 insights and 3 charts generated.',
  n6: 'Created data.csv and sources.json.',
  n7: 'Draft complete: 6 sections, 18 citations.',
  n8: 'All claims verified against evidence. Quality score 0.93.',
  n9: 'Deliverable bundle assembled.',
};

export function createEvidence() {
  const claims = [
    ['Segment growth is concentrated in enterprise automation', 'source-01.example.com/report', 0.94],
    ['Most leaders sell usage-based or seat-based subscriptions', 'source-04.example.com/analysis', 0.88],
    ['Funding is skewed toward the top three companies', 'source-07.example.com/funding', 0.81],
    ['Vertical products outpace horizontal tools in retention', 'source-09.example.com/study', 0.72],
    ['Regional language support is an emerging differentiator', 'source-12.example.com/trends', 0.67],
    ['Public pricing is available for only some vendors', 'source-03.example.com/pricing', 0.58],
  ];
  return claims.map(([claim, source, confidence], i) => ({
    id: `E${i + 1}`,
    claim,
    source,
    confidence,
    flagged: confidence < 0.7,
  }));
}

/** Advance one running task by `dt` virtual milliseconds. Returns {task, notices}. */
export function stepTask(task, dt, now = Date.now()) {
  if (task.status !== 'running' && task.status !== 'awaiting_approval') return { task, notices: [] };
  const t = {
    ...task,
    nodes: task.nodes.map((x) => ({ ...x })),
    logs: [...task.logs],
    messages: [...task.messages],
    metrics: { ...task.metrics },
  };
  const notices = [];
  const byId = Object.fromEntries(t.nodes.map((x) => [x.id, x]));

  for (const node of t.nodes) {
    // retry countdown after failure
    if (node.status === 'failed' && node.retryIn != null) {
      node.retryIn -= dt;
      if (node.retryIn <= 0) {
        node.retryIn = null;
        node.status = 'running';
        node.attempt += 1;
        node.elapsed = 0;
        node.progress = 0;
        node.duration = Math.round(node.duration * 0.8);
        log(t, now, node.agent, 'info', `Self-correction: retrying "${node.label}" with a refined strategy (attempt ${node.attempt}).`);
        t.metrics.retries += 1;
      }
      continue;
    }

    if (node.status === 'pending') {
      if (!node.deps.every((d) => byId[d].status === 'completed')) continue;
      if (node.approval && !node.approved) {
        node.status = 'awaiting_approval';
        log(t, now, node.agent, 'warn', `Waiting for your approval: ${node.approval.title}.`);
        notices.push({ kind: 'approval', taskId: t.id, text: `${t.title} needs your approval` });
        continue;
      }
      node.status = 'running';
      node.startedAt = node.startedAt ?? now;
      log(t, now, node.agent, 'info', `${START_LINES[node.agent]} — ${node.label}.`);
      const upstream = node.deps.map((d) => byId[d].agent)[0];
      if (upstream) msg(t, now, upstream, node.agent, 'handoff', `Handing over results for "${node.label}".`, { node: node.id, deps: node.deps });
    }

    if (node.status === 'running') {
      node.elapsed += dt;
      node.progress = Math.min(99, Math.round((node.elapsed / node.duration) * 100));
      if (node.elapsed < node.duration) continue;

      // Researcher failure demo: first attempt of n4 is rate limited.
      if (node.id === 'n4' && node.attempt === 1 && !t.options.noFailures) {
        node.status = 'failed';
        node.retryIn = 1600;
        node.progress = 62;
        log(t, now, node.agent, 'error', 'Search API returned 429 (rate limited) after 18 requests.');
        msg(t, now, node.agent, 'supervisor', 'error', 'Search provider rate limited. Requesting retry with backoff and alternate query set.');
        continue;
      }

      // Reviewer sends work back to the Writer once.
      if (node.reviewFailsOnce && !t.options.noFailures) {
        node.reviewFailsOnce = false;
        node.status = 'pending';
        node.elapsed = 0;
        node.progress = 0;
        node.attempt += 1;
        const w = byId.n7;
        w.status = 'running';
        w.attempt += 1;
        w.elapsed = 0;
        w.progress = 0;
        w.duration = 2800;
        log(t, now, 'reviewer', 'warn', 'Section 4 contains 1 claim without a supporting source. Returning draft to Writer.');
        msg(t, now, 'reviewer', 'writer', 'revision', 'Claim "Vertical products outpace horizontal tools" has no citation. Add a source or remove it.', {
          evidence: 'E4',
          severity: 'medium',
        });
        log(t, now, 'writer', 'info', 'Revision requested. Adding citations and re-checking section 4.');
        t.metrics.retries += 1;
        continue;
      }

      node.status = 'completed';
      node.progress = 100;
      node.finishedAt = now;
      t.metrics.tokens += node.tokens;
      log(t, now, node.agent, 'success', DONE_LINES[node.id] || `${node.label} complete.`);
      const downstream = t.nodes.find((x) => x.deps.includes(node.id));
      if (downstream) msg(t, now, node.agent, downstream.agent, 'result', `Completed "${node.label}".`, { node: node.id, tokens: node.tokens });
    }
  }

  // Derived task state
  const waiting = t.nodes.some((x) => x.status === 'awaiting_approval');
  const done = t.nodes.every((x) => x.status === 'completed');
  t.status = waiting ? 'awaiting_approval' : 'running';
  t.progress = Math.round(t.nodes.reduce((a, x) => a + (x.status === 'completed' ? 100 : x.progress), 0) / t.nodes.length);
  t.metrics.cost = t.metrics.tokens * TOKEN_RATE_USD;
  t.metrics.durationMs = (t.metrics.durationMs || 0) + dt;

  if (done) {
    t.status = 'completed';
    t.progress = 100;
    t.finishedAt = now;
    t.evidence = createEvidence();
    t.deliverables = makeDeliverables(t);
    log(t, now, 'supervisor', 'success', 'Task complete. Deliverables are ready.');
    notices.push({ kind: 'done', taskId: t.id, text: `${t.title} is ready` });
  }
  return { task: t, notices };
}

export function makeDeliverables(t) {
  const csv = buildCsv(t);
  const report = buildReport(t);
  return [
    { id: 'd1', name: 'report.md', label: 'Market report', kind: 'report', size: report.length },
    { id: 'd2', name: 'data.csv', label: 'Comparison table', kind: 'csv', size: csv.length },
    { id: 'd3', name: 'sources.json', label: 'Evidence and sources', kind: 'json', size: JSON.stringify(t.evidence || createEvidence()).length },
  ];
}

export function approveNode(task, nodeId) {
  const t = { ...task, nodes: task.nodes.map((x) => ({ ...x })), logs: [...task.logs] };
  const node = t.nodes.find((x) => x.id === nodeId);
  if (!node || node.status !== 'awaiting_approval') return task;
  node.approved = true;
  node.status = 'pending'; // engine starts it on next tick
  log(t, Date.now(), 'supervisor', 'success', `You approved: ${node.approval.title}.`);
  t.status = 'running';
  return t;
}

export function rejectNode(task, nodeId) {
  const t = { ...task, nodes: task.nodes.map((x) => ({ ...x })), logs: [...task.logs] };
  const node = t.nodes.find((x) => x.id === nodeId);
  if (!node) return task;
  log(t, Date.now(), 'supervisor', 'warn', `You rejected: ${node.approval.title}. Task stopped.`);
  return cancelTask({ ...t, logs: t.logs }, 'Rejected at approval checkpoint');
}

export function cancelTask(task, reason = 'Cancelled by user') {
  const t = { ...task, nodes: task.nodes.map((x) => ({ ...x })), logs: [...task.logs] };
  t.nodes.forEach((x) => {
    if (['running', 'pending', 'awaiting_approval', 'failed'].includes(x.status)) x.status = 'cancelled';
  });
  t.status = 'cancelled';
  t.finishedAt = Date.now();
  log(t, t.finishedAt, 'supervisor', 'warn', `${reason}.`);
  return t;
}

export function resetTask(task) {
  return {
    ...task,
    status: 'running',
    progress: 0,
    startedAt: Date.now(),
    finishedAt: null,
    logs: [],
    messages: [],
    deliverables: [],
    evidence: [],
    metrics: { tokens: 0, cost: 0, durationMs: 0, retries: 0 },
    nodes: task.nodes.map((x) => ({
      ...x,
      status: 'pending',
      progress: 0,
      elapsed: 0,
      attempt: 1,
      approved: false,
      retryIn: null,
      reviewFailsOnce: x.agent === 'reviewer',
      startedAt: null,
      finishedAt: null,
    })),
  };
}

export const agentName = (id) => AGENTS[id]?.name ?? id;
