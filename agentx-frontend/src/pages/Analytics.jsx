import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { useApp } from '../store/AppStore';
import { Card, CardHeader, PageHeader, Segmented, Stat } from '../components/ui';
import { AGENT_LIST, AGENTS } from '../lib/agents';
import { fmtCompact, fmtDate, fmtDuration, fmtNumber, fmtPct, fmtUsd } from '../lib/format';
import { useChartColors } from '../hooks/useChartColors';
import { Coins, Cpu, Percent, Timer } from 'lucide-react';

const DAY = 86_400_000;

export default function Analytics() {
  const { state } = useApp();
  const c = useChartColors();
  const [range, setRange] = useState(14);
  const since = Date.now() - range * DAY;
  const tasks = state.tasks.filter((t) => t.createdAt >= since);

  const daily = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    return Array.from({ length: range }, (_, i) => {
      const start = today - (range - 1 - i) * DAY;
      const day = state.tasks.filter((t) => t.createdAt >= start && t.createdAt < start + DAY);
      return { day: fmtDate(start), tokens: day.reduce((a, t) => a + t.metrics.tokens, 0), cost: +day.reduce((a, t) => a + t.metrics.cost, 0).toFixed(4), tasks: day.length };
    });
  }, [state.tasks, range]);

  const agentRows = useMemo(
    () =>
      AGENT_LIST.map((a) => {
        const nodes = tasks.flatMap((t) => t.nodes.filter((n) => n.agent === a.id && n.status !== 'pending'));
        const done = nodes.filter((n) => n.status === 'completed');
        return {
          id: a.id,
          name: a.name,
          steps: nodes.length,
          avg: done.length ? done.reduce((s, n) => s + n.elapsed, 0) / done.length / 1000 : 0,
          success: nodes.length ? done.filter((n) => n.attempt === 1).length / nodes.length : 0,
          tokens: done.reduce((s, n) => s + n.tokens, 0),
        };
      }),
    [tasks],
  );

  const finished = tasks.filter((t) => ['completed', 'failed', 'cancelled'].includes(t.status));
  const completed = finished.filter((t) => t.status === 'completed').length;
  const totalTokens = tasks.reduce((a, t) => a + t.metrics.tokens, 0);
  const totalCost = tasks.reduce((a, t) => a + t.metrics.cost, 0);
  const avgDur = finished.length ? finished.reduce((a, t) => a + t.metrics.durationMs, 0) / finished.length : 0;
  const outcome = ['completed', 'failed', 'cancelled'].map((s) => ({ s, n: tasks.filter((t) => t.status === s).length }));

  const tip = { contentStyle: { background: c.surface, border: `1px solid ${c['line-strong']}`, borderRadius: 10, fontSize: 12, color: c.fg }, labelStyle: { color: c.muted }, cursor: { fill: c.line, fillOpacity: 0.4 } };
  const axis = { tickLine: false, axisLine: false, tick: { fill: c.muted, fontSize: 11 } };

  return (
    <div>
      <PageHeader title="Analytics" description="Usage, cost and how well each agent performs." actions={<Segmented value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }]} />} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completion rate" value={fmtPct(finished.length ? completed / finished.length : 0)} sub={`${completed} of ${finished.length} finished`} icon={Percent} />
        <Stat label="Tokens used" value={fmtCompact(totalTokens)} sub={`${fmtNumber(totalTokens / Math.max(1, tasks.length))} per task`} icon={Cpu} />
        <Stat label="Total cost" value={fmtUsd(totalCost)} sub={`${fmtUsd(totalCost / Math.max(1, tasks.length))} per task`} icon={Coins} />
        <Stat label="Avg duration" value={fmtDuration(avgDur)} sub="Per finished task" icon={Timer} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Token consumption" subtitle="Tokens per day" />
          <div className="h-60 px-2 pb-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ left: -8, right: 12, top: 4 }}>
                <defs><linearGradient id="tk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c['accent-text']} stopOpacity={0.28} /><stop offset="100%" stopColor={c['accent-text']} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={range > 7 ? 2 : 0} />
                <YAxis {...axis} tickFormatter={fmtCompact} />
                <Tooltip {...tip} formatter={(v) => [fmtNumber(v), 'Tokens']} />
                <Area type="monotone" dataKey="tokens" stroke={c['accent-text']} strokeWidth={2} fill="url(#tk)" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cost" subtitle="USD per day" />
          <div className="h-60 px-2 pb-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ left: -4, right: 12, top: 4 }}>
                <CartesianGrid vertical={false} stroke={c.line} />
                <XAxis dataKey="day" {...axis} interval={range > 7 ? 2 : 0} />
                <YAxis {...axis} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...tip} formatter={(v) => [fmtUsd(v), 'Cost']} />
                <Bar dataKey="cost" fill={c['info']} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Agent performance" subtitle="Average step time in seconds, and how often steps succeed on the first try" />
          <div className="grid gap-0 md:grid-cols-[1fr_1fr]">
            <div className="h-72 px-2 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentRows} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={c.line} />
                  <XAxis type="number" {...axis} unit="s" />
                  <YAxis type="category" dataKey="name" width={78} {...axis} tick={{ fill: c.fg, fontSize: 12 }} />
                  <Tooltip {...tip} formatter={(v) => [`${v.toFixed(1)}s`, 'Avg step time']} />
                  <Bar dataKey="avg" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {agentRows.map((r) => <Cell key={r.id} fill={c[`a-${r.id}`]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto border-t border-line md:border-l md:border-t-0">
              <table className="w-full text-left text-[13px]">
                <thead className="text-xs text-muted"><tr className="border-b border-line"><th className="px-4 py-2.5 font-medium">Agent</th><th className="px-3 py-2.5 text-right font-medium">Steps</th><th className="px-3 py-2.5 text-right font-medium">First try</th><th className="px-4 py-2.5 text-right font-medium">Tokens</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {agentRows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: c[`a-${r.id}`] }} />{r.name}</span></td>
                      <td className="px-3 py-2.5 text-right tabular">{r.steps}</td>
                      <td className="px-3 py-2.5 text-right tabular">{fmtPct(r.success)}</td>
                      <td className="px-4 py-2.5 text-right tabular">{fmtCompact(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Task outcomes" subtitle={`${tasks.length} tasks in range`} />
          <ul className="space-y-4 p-4">
            {outcome.map(({ s, n }) => {
              const color = { completed: 'rgb(var(--ok))', failed: 'rgb(var(--bad))', cancelled: 'rgb(var(--faint))' }[s];
              const pct = tasks.length ? n / tasks.length : 0;
              return (
                <li key={s}>
                  <div className="flex items-baseline justify-between text-[13px]"><span className="capitalize">{s}</span><span className="tabular text-muted">{n} · {fmtPct(pct)}</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
