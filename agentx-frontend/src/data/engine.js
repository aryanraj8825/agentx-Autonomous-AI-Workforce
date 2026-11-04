/**
 * Simulated run engine.
 *
 * This mirrors the state a LangGraph workflow would stream from the backend:
 * a plan of steps with dependencies, per-step status, logs, approval gates and
 * a reviewer that can return work for revision. Every function is pure, so it
 * can be replaced by WebSocket events (see src/lib/api.js) without touching UI.
 */
import { slugify } from '../lib/format'

export const TIERS = {
  fast: { label: 'Fast', hint: 'Lower cost, shallower analysis', speed: 0.65, cost: 0.4 },
  balanced: { label: 'Balanced', hint: 'Good default for most goals', speed: 1, cost: 1 },
  deep: { label: 'Deep', hint: 'Slower, more thorough reasoning', speed: 1.6, cost: 2.4 },
}

const COST_PER_1K_TOKENS = 0.0006
export const costOf = (tokens, tier = 'balanced') =>
  (tokens / 1000) * COST_PER_1K_TOKENS * (TIERS[tier]?.cost ?? 1)

export const ACTIVE_STATUSES = ['running', 'awaiting_approval']
const SATISFIED = ['done', 'returned']
const FINISHED_STEP = ['done', 'returned', 'skipped']

const step = (id, agent, title, deps, duration, tokens, extra = {}) => ({
  id,
  agent,
  title,
  deps,
  duration,
  tokens,
  status: 'pending',
  progress: 0,
  attempt: 1,
  startedAt: null,
  endedAt: null,
  tool: null,
  approval: false,
  approved: false,
  failFirst: false,
  start: '',
  done: '',
  note: '',
  ...extra,
})

export function buildPlan(goal, opts = {}) {
  const parallel = opts.parallel !== false
  const approval = opts.approval !== false
  return [
    step('s1', 'supervisor', 'Interpret objective and select agents', [], 1800, 420, {
      start: 'Reading the goal and matching it to agent capabilities',
      done: 'Selected planner, researcher, analyst, executor, writer and reviewer',
    }),
    step('s2', 'planner', 'Break the goal into a dependency-aware plan', ['s1'], 2400, 780, {
      start: 'Decomposing the goal into subtasks',
      done: 'Created a 10-step plan. Research steps can run in parallel',
    }),
    step('s3', 'researcher', 'Collect sources and key facts', ['s2'], 4200, 2900, {
      tool: 'web_search',
      start: 'Searching the web and fetching candidate sources',
      done: 'Collected 24 sources and extracted 61 facts with links',
    }),
    step('s4', 'researcher', 'Gather supporting data and figures', parallel ? ['s2'] : ['s3'], 3800, 2400, {
      tool: 'document_retriever',
      start: 'Retrieving figures and related findings from memory',
      done: 'Matched 9 prior findings and 17 new data points',
    }),
    step('s5', 'analyst', 'Compare options and surface patterns', ['s3', 's4'], 3600, 2100, {
      tool: 'python_sandbox',
      start: 'Normalising data and comparing options on shared criteria',
      done: 'Built a comparison table and identified 4 patterns',
    }),
    step('s6', 'executor', 'Run analysis script and build data tables', ['s5'], 3000, 900, {
      tool: 'python_sandbox',
      start: 'Running analysis script in the sandbox',
      done: 'Generated comparison-data.csv with 10 rows',
    }),
    step('s7', 'writer', 'Draft the report and executive summary', ['s5'], 4200, 3300, {
      start: 'Drafting sections from the findings',
      done: 'Drafted 6 sections and an executive summary',
    }),
    step('s8', 'reviewer', 'Check claims against sources', ['s6', 's7'], 2600, 1200, {
      failFirst: true,
      start: 'Matching each claim to its supporting source',
      done: 'Review complete',
    }),
    step('s9', 'executor', 'Publish deliverables to the workspace', ['s8'], 1600, 300, {
      tool: 'file_generator',
      approval,
      start: 'Writing deliverables to the workspace',
      done: 'Published 3 files to the workspace',
    }),
    step('s10', 'supervisor', 'Assemble and deliver the final output', ['s9'], 1400, 500, {
      start: 'Combining approved outputs',
      done: 'Final bundle assembled',
    }),
  ]
}

export function titleFrom(goal) {
  const clean = goal.replace(/\s+/g, ' ').trim()
  return clean.length > 84 ? `${clean.slice(0, 81)}…` : clean
}

export function createTask({ id, goal, opts = {}, now = Date.now() }) {
  const options = { tier: 'balanced', approval: true, parallel: true, ...opts }
  return {
    id,
    title: titleFrom(goal),
    goal,
    opts: options,
    status: 'running',
    createdAt: now,
    startedAt: now,
    finishedAt: null,
    steps: buildPlan(goal, options),
    logs: [
      {
        id: `${id}-l0`,
        ts: now,
        agent: 'supervisor',
        level: 'info',
        text: 'Goal received. Starting a new run.',
        stepId: null,
      },
    ],
    notifications: [],
    deliverables: [],
    tokens: 0,
    seq: 0,
  }
}

function cloneTask(task) {
  return {
    ...task,
    steps: task.steps.map((s) => ({ ...s })),
    logs: [...task.logs],
    notifications: [...task.notifications],
  }
}

function writers(t, now) {
  const log = (agent, level, text, stepId = null) => {
    t.seq += 1
    t.logs.push({ id: `${t.id}-l${t.seq}`, ts: now, agent, level, text, stepId })
  }
  const notify = (kind, text) => {
    t.seq += 1
    t.notifications.push({ id: `${t.id}-n${t.seq}`, ts: now, kind, text, taskId: t.id })
  }
  return { log, notify }
}

/** Move a running task forward by `dt` milliseconds of simulated work. */
export function advanceTask(task, dt, now = Date.now()) {
  if (!ACTIVE_STATUSES.includes(task.status)) return task
  const t = cloneTask(task)
  const { log, notify } = writers(t, now)
  const byId = (id) => t.steps.find((s) => s.id === id)
  const speed = TIERS[t.opts.tier || 'balanced'].speed

  for (const s of [...t.steps]) {
    if (s.status !== 'running') continue
    s.progress = Math.min(100, s.progress + (dt / (s.duration * speed)) * 100)
    if (s.progress < 100) continue
    s.endedAt = now
    t.tokens += s.tokens
    if (s.failFirst && s.attempt === 1) {
      s.status = 'returned'
      s.note = 'Sent back to the writer: 2 claims had no supporting source'
      log(s.agent, 'warn', 'Found 2 claims without a supporting source. Returning the draft to the writer.', s.id)
      const revise = step('r1', 'writer', 'Revise draft using reviewer notes', [s.id], 2600, 1900, {
        start: 'Applying reviewer corrections to the draft',
        done: 'Added citations for 2 claims and removed 1 unsupported statement',
      })
      const recheck = step('r2', 'reviewer', 'Re-check revised claims', ['r1'], 1800, 900, {
        attempt: 2,
        start: 'Re-verifying the revised claims',
        done: 'All claims trace to a source. Quality score 94/100',
      })
      t.steps.push(revise, recheck)
      const publish = byId('s9')
      if (publish) publish.deps = [...publish.deps.filter((d) => d !== s.id), 'r2']
    } else {
      s.status = 'done'
      log(s.agent, 'ok', s.done || `Completed: ${s.title}`, s.id)
    }
  }

  for (const s of t.steps) {
    if (s.status !== 'pending') continue
    const ready = s.deps.every((d) => {
      const dep = byId(d)
      return dep && SATISFIED.includes(dep.status)
    })
    if (!ready) continue
    if (s.approval && !s.approved) {
      s.status = 'waiting'
      log(s.agent, 'warn', 'Paused. Publishing writes files to the workspace and needs your approval.', s.id)
      notify('approval', `Approval needed: ${s.title}`)
    } else {
      s.status = 'running'
      s.startedAt = now
      s.progress = 0
      log(s.agent, 'info', s.start || `Started: ${s.title}`, s.id)
    }
  }

  const allFinished = t.steps.every((s) => FINISHED_STEP.includes(s.status))
  if (allFinished) {
    t.status = 'completed'
    t.finishedAt = now
    t.deliverables = buildDeliverables(t)
    log('supervisor', 'ok', `Run complete. ${t.deliverables.length} deliverables are ready to download.`)
    notify('success', `Finished: ${t.title}`)
  } else {
    t.status = t.steps.some((s) => s.status === 'waiting') ? 'awaiting_approval' : 'running'
  }
  return t
}

export function approveStep(task, stepId, now = Date.now()) {
  const t = cloneTask(task)
  const { log } = writers(t, now)
  const s = t.steps.find((x) => x.id === stepId)
  if (!s || s.status !== 'waiting') return task
  s.approved = true
  s.status = 'pending'
  t.status = 'running'
  log('supervisor', 'ok', 'Approval granted. Resuming execution.', stepId)
  return t
}

export function rejectStep(task, stepId, now = Date.now()) {
  const t = cloneTask(task)
  const { log, notify } = writers(t, now)
  const s = t.steps.find((x) => x.id === stepId)
  if (!s || s.status !== 'waiting') return task
  s.status = 'rejected'
  s.endedAt = now
  t.steps.forEach((x) => {
    if (x.status === 'pending') x.status = 'skipped'
  })
  t.status = 'cancelled'
  t.finishedAt = now
  log('supervisor', 'warn', 'Approval declined. The run was stopped before anything was published.', stepId)
  notify('warn', `Stopped: ${t.title}`)
  return t
}

export function cancelTask(task, now = Date.now()) {
  if (!ACTIVE_STATUSES.includes(task.status)) return task
  const t = cloneTask(task)
  const { log } = writers(t, now)
  t.steps.forEach((x) => {
    if (x.status === 'running') {
      x.status = 'cancelled'
      x.endedAt = now
    } else if (x.status === 'pending' || x.status === 'waiting') {
      x.status = 'skipped'
    }
  })
  t.status = 'cancelled'
  t.finishedAt = now
  log('supervisor', 'warn', 'Run cancelled by user.')
  return t
}

export function failTask(task, reason, now = Date.now()) {
  if (!ACTIVE_STATUSES.includes(task.status)) return task
  const t = cloneTask(task)
  const { log, notify } = writers(t, now)
  const target = t.steps.find((x) => x.status === 'running' && x.agent === 'researcher') || t.steps.find((x) => x.status === 'running')
  if (target) {
    target.status = 'failed'
    target.endedAt = now
    target.note = reason
    log(target.agent, 'error', reason, target.id)
  }
  t.steps.forEach((x) => {
    if (x.status === 'running') {
      x.status = 'cancelled'
      x.endedAt = now
    } else if (x.status === 'pending' || x.status === 'waiting') {
      x.status = 'skipped'
    }
  })
  t.status = 'failed'
  t.finishedAt = now
  log('supervisor', 'error', 'Run stopped after a step failed. You can run it again.')
  notify('error', `Failed: ${t.title}`)
  return t
}

export function taskProgress(task) {
  if (!task.steps.length) return 0
  const total = task.steps.length
  const sum = task.steps.reduce((acc, s) => {
    if (FINISHED_STEP.includes(s.status)) return acc + 1
    if (s.status === 'running') return acc + s.progress / 100
    return acc
  }, 0)
  return Math.min(100, Math.round((sum / total) * 100))
}

export function taskCost(task) {
  return costOf(task.tokens, task.opts?.tier)
}

/* ---------------------------------------------------------------- */
/* Deliverables                                                      */
/* ---------------------------------------------------------------- */

const SAMPLE_COMPANIES = [
  ['Nimbus Labs', 'Document intelligence for legal teams', 'Series A', '$18M', 'Usage-based API'],
  ['Vaani Works', 'Voice agents for regional-language support', 'Seed', '$4M', 'Per-seat SaaS'],
  ['Kestrel Systems', 'Fraud detection for lenders', 'Series B', '$42M', 'Platform licence'],
  ['Pariksha', 'Adaptive assessments for schools', 'Series A', '$12M', 'Institutional subscription'],
  ['Ledgerly', 'Automated bookkeeping for small businesses', 'Seed', '$6M', 'Freemium with add-ons'],
  ['Lumen Vision', 'Computer vision for factory quality checks', 'Series A', '$15M', 'Per-line licence'],
  ['Sutra Health', 'Clinical note drafting', 'Seed', '$5M', 'Per-clinician subscription'],
  ['Roop Studio', 'Product imagery for online brands', 'Seed', '$3M', 'Credits'],
  ['Tarang Analytics', 'Demand forecasting for retail', 'Series B', '$30M', 'Platform licence'],
  ['Guardrail Works', 'Safety controls for enterprise LLMs', 'Series A', '$20M', 'Usage-based API'],
]

export function buildDeliverables(task) {
  const base = slugify(task.title, 36)
  return [
    { id: 'report', name: `${base}-report.md`, kind: 'markdown', label: 'Report', mime: 'text/markdown' },
    { id: 'data', name: `${base}-data.csv`, kind: 'csv', label: 'Comparison data', mime: 'text/csv' },
    { id: 'sources', name: `${base}-sources.json`, kind: 'json', label: 'Source list', mime: 'application/json' },
  ]
}

export function deliverableContent(task, d) {
  if (d.kind === 'csv') {
    const rows = [['company', 'product', 'stage', 'funding', 'business_model'], ...SAMPLE_COMPANIES]
    return rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  }
  if (d.kind === 'json') {
    return JSON.stringify(
      {
        task: task.title,
        note: 'Illustrative sample data produced by the AgentX demo engine.',
        sources: SAMPLE_COMPANIES.map(([name], i) => ({
          id: i + 1,
          title: `${name} company profile`,
          url: `https://example.com/profiles/${slugify(name)}`,
        })),
      },
      null,
      2,
    )
  }
  const table = SAMPLE_COMPANIES.map((c) => `| ${c.join(' | ')} |`).join('\n')
  return [
    `# ${task.title}`,
    '',
    '> Illustrative output from the AgentX demo engine. Companies and figures are fictional.',
    '> Connect the backend to produce real, sourced results.',
    '',
    '## Executive summary',
    '',
    'Ten companies were compared on product focus, funding stage and business model. Usage-based APIs and platform licences dominate at later stages, while seed-stage companies favour per-seat subscriptions.',
    '',
    '## Comparison',
    '',
    '| Company | Product | Stage | Funding | Business model |',
    '| --- | --- | --- | --- | --- |',
    table,
    '',
    '## Review notes',
    '',
    '- First review found 2 claims without a source. They were revised and re-checked.',
    '- Final quality score: 94/100.',
    '',
  ].join('\n')
}
