import { useState } from 'react';
import { Eye, Pencil, Play, ShieldQuestion } from 'lucide-react';
import { useApp, useDerived } from '../store/AppStore';
import { AgentAvatar, Card, CardHeader, Dot, PageHeader, Switch, Select, Badge, Field } from '../components/ui';
import { AGENT_LIST, AGENTS, agentColor } from '../lib/agents';
import { cn } from '../lib/cn';
import { fmtDuration, fmtNumber, fmtPct, fmtClock } from '../lib/format';

const PERM = {
  read: { label: 'Read', Icon: Eye, tone: 'text-info' },
  write: { label: 'Write', Icon: Pencil, tone: 'text-warn' },
  exec: { label: 'Execute', Icon: Play, tone: 'text-bad' },
  approve: { label: 'Needs approval', Icon: ShieldQuestion, tone: 'text-warn' },
};

function agentStats(tasks, id) {
  const nodes = tasks.flatMap((t) => t.nodes.filter((n) => n.agent === id));
  const done = nodes.filter((n) => n.status === 'completed');
  const clean = done.filter((n) => n.attempt === 1);
  return {
    runs: done.length,
    success: done.length ? clean.length / done.length : 0,
    avg: done.length ? done.reduce((a, n) => a + n.elapsed, 0) / done.length : 0,
    tokens: done.reduce((a, n) => a + n.tokens, 0),
  };
}

export default function AgentWorkspace() {
  const { state, configureAgent } = useApp();
  const d = useDerived();
  const [sel, setSel] = useState('supervisor');
  const a = AGENTS[sel];
  const cfg = state.agentConfig[sel];
  const s = agentStats(state.tasks, sel);
  const recent = state.tasks
    .flatMap((t) => t.logs.filter((l) => l.agent === sel).map((l) => ({ ...l, task: t })))
    .sort((x, y) => y.ts - x.ts)
    .slice(0, 8);
  const cur = d.current[sel];

  return (
    <div>
      <PageHeader title="Agent workspace" description="Each agent has its own tools, permissions, inputs and outputs. Select one to inspect or configure it." />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <ul className="space-y-2">
          {AGENT_LIST.map((x) => {
            const on = sel === x.id;
            const c = d.current[x.id];
            return (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} aria-pressed={on} className={cn('flex w-full items-center gap-3 rounded-xl border bg-surface p-3 text-left transition', on ? 'border-line-strong' : 'border-line hover:border-line-strong')} style={on ? { boxShadow: `inset 3px 0 0 ${agentColor(x.id)}` } : undefined}>
                  <AgentAvatar id={x.id} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{x.name}</span>
                    <span className="block truncate text-xs text-muted">{c ? c.node.label : x.role}</span>
                  </span>
                  {!state.agentConfig[x.id].enabled ? <Badge>Off</Badge> : <Dot color={c ? agentColor(x.id) : 'rgb(var(--line-strong))'} pulse={!!c} />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-start gap-4 p-5">
              <AgentAvatar id={sel} size={52} ring />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{a.name}</h2>
                <p className="text-xs text-muted">{a.role}</p>
                <p className="mt-2 max-w-xl text-[13px] text-muted">{a.summary}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{cfg.enabled ? 'Enabled' : 'Disabled'}</span>
                <Switch checked={cfg.enabled} onChange={(v) => configureAgent(sel, { enabled: v })} label={`Enable ${a.name}`} />
              </div>
            </div>
            <dl className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
              {[
                ['Steps completed', fmtNumber(s.runs)],
                ['First-try success', fmtPct(s.success)],
                ['Avg step time', fmtDuration(s.avg)],
                ['Tokens used', fmtNumber(s.tokens)],
              ].map(([k, v], i) => (
                <div key={k} className={cn('px-5 py-3.5', i > 0 && 'sm:border-l sm:border-line')}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Tools and permissions" subtitle="What this agent is allowed to do" />
              <ul className="divide-y divide-line">
                {a.tools.map((t) => {
                  const p = PERM[t.perm];
                  return (
                    <li key={t.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="font-mono text-xs">{t.name}</span>
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', p.tone)}><p.Icon className="h-3.5 w-3.5" />{p.label}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHeader title="Responsibilities" />
              <ul className="space-y-2 p-4 text-[13px]">
                {a.responsibilities.map((r) => (
                  <li key={r} className="flex gap-2.5"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />{r}</li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-4 border-t border-line p-4 text-[13px]">
                <div>
                  <div className="mb-1.5 text-xs text-muted">Inputs</div>
                  <ul className="space-y-1">{a.inputs.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-muted">Outputs</div>
                  <ul className="space-y-1">{a.outputs.map((i) => <li key={i}>{i}</li>)}</ul>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Configuration" subtitle="Applies to new tasks" />
              <div className="space-y-4 p-4">
                <Field label="Model" htmlFor="model">
                  <Select id="model" value={cfg.model} onChange={(e) => configureAgent(sel, { model: e.target.value })}>
                    <option value="gemini-2.5-pro">gemini-2.5-pro (best reasoning)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (faster, cheaper)</option>
                    <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite (lowest cost)</option>
                  </Select>
                </Field>
                <Field label={`Temperature: ${cfg.temperature.toFixed(1)}`} htmlFor="temp" hint="Lower is more consistent. Higher is more creative.">
                  <input id="temp" type="range" min={0} max={1} step={0.1} value={cfg.temperature} onChange={(e) => configureAgent(sel, { temperature: +e.target.value })} className="w-full accent-[rgb(var(--accent))]" />
                </Field>
                <Field label={`Max retries: ${cfg.maxRetries}`} htmlFor="retries" hint="Failed steps retry with a changed strategy.">
                  <input id="retries" type="range" min={0} max={5} step={1} value={cfg.maxRetries} onChange={(e) => configureAgent(sel, { maxRetries: +e.target.value })} className="w-full accent-[rgb(var(--accent))]" />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="Recent activity" subtitle={cur ? `Working on: ${cur.node.label}` : 'Idle'} />
              {recent.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted">No activity yet.</div>
              ) : (
                <ul className="divide-y divide-line">
                  {recent.map((l) => (
                    <li key={l.id} className="px-4 py-2.5">
                      <div className="text-[13px]">{l.text}</div>
                      <div className="mt-0.5 text-xs text-muted">{l.task.id} · {fmtClock(l.ts)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
