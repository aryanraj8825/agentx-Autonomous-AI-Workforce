/**
 * Workflow templates. `buildWorkflow` returns the dependency graph (DAG) the
 * Planner would normally produce. In production this comes from the backend
 * (LangGraph); here it drives the demo engine.
 */
export const TEMPLATES = [
  {
    id: 'market',
    title: 'Market research report',
    icon: 'TrendingUp',
    prompt:
      'Research the top 10 AI startups in India, compare their products, funding and business models, and prepare a professional market research report.',
  },
  {
    id: 'competitor',
    title: 'Competitor analysis',
    icon: 'Swords',
    prompt:
      'Build a competitor analysis for a project-management SaaS: identify competitors, compare pricing and features, and list strengths and weaknesses.',
  },
  {
    id: 'literature',
    title: 'Literature review',
    icon: 'BookOpen',
    prompt:
      'Review recent papers on retrieval-augmented generation, summarise the main approaches and produce a comparison table with sources.',
  },
  {
    id: 'custom',
    title: 'Describe your own',
    icon: 'Sparkles',
    prompt: '',
  },
];

export function classifyPrompt(prompt = '') {
  const p = prompt.toLowerCase();
  if (/competitor|pricing|versus|vs\b/.test(p)) return 'competitor';
  if (/paper|literature|study|studies|research papers|survey/.test(p)) return 'literature';
  return 'market';
}

const n = (id, agent, label, deps, duration, tokens, extra = {}) => ({
  id,
  agent,
  label,
  deps,
  duration,
  tokens,
  status: 'pending',
  progress: 0,
  elapsed: 0,
  attempt: 1,
  startedAt: null,
  finishedAt: null,
  ...extra,
});

const LABELS = {
  market: ['Collect company profiles', 'Collect funding and product data', 'Compare models and positioning', 'Draft market report'],
  competitor: ['Identify competitors and plans', 'Collect pricing and feature data', 'Compare strengths and weaknesses', 'Draft competitor report'],
  literature: ['Find recent papers', 'Extract methods and results', 'Compare approaches', 'Draft literature review'],
};

export function buildWorkflow(kind = 'market', options = {}) {
  const L = LABELS[kind] || LABELS.market;
  const needsApproval = options.autonomy !== 'autonomous';
  return [
    n('n1', 'supervisor', 'Interpret objective', [], 2200, 900),
    n('n2', 'planner', 'Break goal into subtasks', ['n1'], 3000, 2100),
    n('n3', 'researcher', L[0], ['n2'], 5200, 6400),
    n('n4', 'researcher', L[1], ['n2'], 6000, 7200),
    n('n5', 'analyst', L[2], ['n3', 'n4'], 5000, 5300),
    n('n6', 'executor', 'Generate CSV and charts', ['n5'], 3600, 1800, {
      approval: needsApproval
        ? {
            title: 'Write deliverables to your workspace',
            detail:
              'The Executor will create data.csv and sources.json and save them to the connected workspace storage. No data leaves AgentX.',
            risk: 'low',
          }
        : null,
    }),
    n('n7', 'writer', L[3], ['n5'], 5600, 6800),
    n('n8', 'reviewer', 'Check facts and citations', ['n6', 'n7'], 3600, 3100, { reviewFailsOnce: true }),
    n('n9', 'supervisor', 'Assemble final deliverable', ['n8'], 2000, 1100),
  ];
}

/** Longest-path layering used by the graph view. */
export function layoutNodes(nodes, { w = 200, h = 64, gx = 84, gy = 28 } = {}) {
  const level = {};
  const byId = Object.fromEntries(nodes.map((x) => [x.id, x]));
  const depth = (id) => {
    if (level[id] != null) return level[id];
    const d = byId[id].deps;
    level[id] = d.length ? 1 + Math.max(...d.map(depth)) : 0;
    return level[id];
  };
  nodes.forEach((x) => depth(x.id));
  const cols = {};
  nodes.forEach((x) => (cols[level[x.id]] ||= []).push(x));
  const maxRows = Math.max(...Object.values(cols).map((c) => c.length));
  const totalH = maxRows * h + (maxRows - 1) * gy;
  const pos = {};
  Object.entries(cols).forEach(([lv, list]) => {
    const colH = list.length * h + (list.length - 1) * gy;
    list.forEach((x, i) => {
      pos[x.id] = { x: Number(lv) * (w + gx), y: (totalH - colH) / 2 + i * (h + gy), w, h };
    });
  });
  const width = (Math.max(...Object.keys(cols).map(Number)) + 1) * w + Math.max(...Object.keys(cols).map(Number)) * gx;
  return { pos, width, height: totalH };
}
