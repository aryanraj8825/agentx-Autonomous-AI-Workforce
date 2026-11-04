import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CheckCircle2, ListChecks, Bot, Percent } from 'lucide-react';
import { useApp, useDerived } from '../store/AppStore';
import { AgentAvatar, Button, Card, CardHeader, Dot, EmptyState, PageHeader, ProgressBar, Stat, StatusBadge, Textarea } from '../components/ui';
import { AGENT_LIST, AGENTS, agentColor } from '../lib/agents';
import { fmtCompact, fmtDate, fmtPct, timeAgo } from '../lib/format';
import { useChartColors } from '../hooks/useChartColors';

const DAY = 86_400_000;

export default function Overview() {
  const nav = useNavigate();
  const { state } = useApp();
  const d = useDerived();
  const c = useChartColors();
  const [goal, setGoal] = useState('');

  const series = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const start = today - (13 - i) * DAY;
      const n = state.tasks.filter((t) => t.createdAt >= start && t.createdAt < start + DAY).length;
      return { day: fmtDate(start), tasks: n };
    });
  }, [state.tasks]);

  const feed = useMemo(
    () =>
      state.tasks
        .flatMap((t) => t.logs.map((l) => ({ ...l, task: t })))
        .filter((l) => l.level !== 'info' || Date.now() - l.ts < 3_600_000)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 8),
    [state.tasks],
  );

  const user = state.user?.name?.split(' ')[0];

  return (
    <div>
      <PageHeader title={`Welcome back, ${user}`} description="Your workforce at a glance. Start a task or check what is running." />

      <Card className="mb-6">
        <div className="p-4">
          <label htmlFor="quick" className="mb-2 block text-sm font-semibold">Give the workforce a goal</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Textarea id="quick" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Research the top 10 AI startups in India and prepare a market report" className="flex-1" />
            <Button variant="primary" size="lg" className="sm:self-stretch" onClick={() => nav('/new', { state: { prompt: goal } })}>
              Plan this task <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total tasks" value={state.tasks.length} sub={`${d.active.length} in progress`} icon={ListChecks} />
        <Stat label="Active agents" value={`${Object.keys(d.working).length}/7`} sub={Object.keys(d.working).length ? 'Working now' : 'All idle'} icon={Bot} />
        <Stat label="Completed jobs" value={d.completed.length} sub={`${fmtCompact(d.tokens)} tokens used`} icon={CheckCircle2} />
        <Stat label="Success rate" value={fmtPct(d.successRate)} sub="Of finished tasks" icon={Percent} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Running now" subtitle="Live progress of active tasks" action={<Link to="/tasks" className="text-xs text-muted hover:text-fg">View all</Link>} />
          {d.active.length === 0 ? (
            <EmptyState title="Nothing is running" description="Start a task and you will see each agent pick up its step here." action={<Button variant="primary" onClick={() => nav('/new')}>New task</Button>} />
          ) : (
            <ul className="divide-y divide-line">
              {d.active.map((t) => {
                const running = t.nodes.filter((n) => n.status === 'running' || n.status === 'awaiting_approval');
                return (
                  <li key={t.id}>
                    <Link to={`/tasks/${t.id}`} className="block px-4 py-3.5 transition hover:bg-raised/50">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px] font-medium">{t.title}</span>
                        <StatusBadge status={t.status} size="sm" />
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <ProgressBar value={t.progress} />
                        <span className="w-9 text-right text-xs tabular text-muted">{t.progress}%</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {running.map((n) => (
                          <span key={n.id} className="inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-xs text-muted">
                            <AgentAvatar id={n.agent} size={16} /> {AGENTS[n.agent].name}: {n.label}
                          </span>
                        ))}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Agents" subtitle="Who is working" />
          <ul className="divide-y divide-line">
            {AGENT_LIST.map((a) => {
              const cur = d.current[a.id];
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <AgentAvatar id={a.id} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted">{cur ? cur.node.label : 'Idle'}</div>
                  </div>
                  <Dot color={cur ? agentColor(a.id) : 'rgb(var(--line-strong))'} pulse={!!cur} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader title="Tasks per day" subtitle="Last 14 days" />
          <div className="h-56 px-2 pb-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: -18, right: 12, top: 4 }}>
                <defs>
                  <linearGradient id="ov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c['accent-text']} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={c['accent-text']} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: c.muted, fontSize: 11 }} interval={2} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: c.muted, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c['line-strong']}`, borderRadius: 10, fontSize: 12, color: c.fg }} labelStyle={{ color: c.muted }} cursor={{ stroke: c['line-strong'] }} />
                <Area type="monotone" dataKey="tasks" name="Tasks" stroke={c['accent-text']} strokeWidth={2} fill="url(#ov)" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {feed.map((l) => (
              <li key={l.id}>
                <Link to={`/tasks/${l.task.id}`} className="flex gap-3 px-4 py-2.5 hover:bg-raised/50">
                  <span className="mt-1.5"><Dot color={agentColor(l.agent)} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{l.text}</span>
                    <span className="text-xs text-muted">{AGENTS[l.agent].name} · {timeAgo(l.ts)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
