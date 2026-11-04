import { useMemo, useState } from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { layoutNodes } from '../../lib/workflow';
import { AGENTS, agentColor } from '../../lib/agents';
import { AgentAvatar, StatusIcon } from '../ui';
import { cn } from '../../lib/cn';

const PAD = 28;

function edgePath(a, b) {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const dx = (x2 - x1) * 0.5;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/** Interactive dependency graph. Edges animate while data flows from a finished node into a running one. */
export default function WorkflowGraph({ nodes, selectedId, onSelect, height = 420 }) {
  const [zoom, setZoom] = useState(1);
  const { pos, width, height: gh } = useMemo(() => layoutNodes(nodes), [nodes]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const W = width + PAD * 2;
  const H = gh + PAD * 2;

  const edges = nodes.flatMap((n) => n.deps.map((d) => ({ from: byId[d], to: n })));

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-bg">
      <div className="grid-bg absolute inset-0 opacity-50" aria-hidden />
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        <button aria-label="Zoom out" className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-raised hover:text-fg" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-10 text-center text-xs tabular text-muted">{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-raised hover:text-fg" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}>
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button aria-label="Reset zoom" className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-raised hover:text-fg" onClick={() => setZoom(1)}>
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative overflow-auto" style={{ height }}>
        <div style={{ width: W * zoom, height: H * zoom }}>
          <div className="relative origin-top-left" style={{ width: W, height: H, transform: `scale(${zoom})` }}>
            <svg className="absolute inset-0" width={W} height={H} aria-hidden>
              <g transform={`translate(${PAD},${PAD})`}>
                {edges.map(({ from, to }) => {
                  const flowing = from.status === 'completed' && (to.status === 'running' || to.status === 'awaiting_approval');
                  const done = from.status === 'completed' && to.status === 'completed';
                  const color = agentColor(from.agent);
                  return (
                    <path
                      key={`${from.id}-${to.id}`}
                      d={edgePath(pos[from.id], pos[to.id])}
                      fill="none"
                      stroke={flowing || done ? color : 'rgb(var(--line-strong))'}
                      strokeWidth={flowing ? 2 : 1.5}
                      strokeOpacity={flowing ? 1 : done ? 0.55 : 0.8}
                      strokeDasharray={flowing ? '6 6' : undefined}
                      className={flowing ? 'animate-dash' : undefined}
                    />
                  );
                })}
              </g>
            </svg>

            {nodes.map((n) => {
              const p = pos[n.id];
              const a = AGENTS[n.agent];
              const sel = selectedId === n.id;
              const live = n.status === 'running';
              return (
                <button
                  key={n.id}
                  onClick={() => onSelect?.(n.id)}
                  aria-pressed={sel}
                  aria-label={`${a.name}: ${n.label}, ${n.status}`}
                  className={cn(
                    'absolute flex flex-col justify-center gap-1.5 rounded-xl border bg-surface px-3 text-left transition',
                    sel ? 'border-fg/70' : 'border-line hover:border-line-strong',
                    n.status === 'pending' && 'opacity-70',
                    n.status === 'failed' && 'border-bad/50',
                    n.status === 'awaiting_approval' && 'border-warn/60',
                  )}
                  style={{ left: p.x + PAD, top: p.y + PAD, width: p.w, height: p.h, boxShadow: live ? `0 0 0 1px ${agentColor(n.agent, 0.5)}, 0 0 22px -4px ${agentColor(n.agent, 0.45)}` : undefined }}
                >
                  <span className="flex items-center gap-2.5">
                    <AgentAvatar id={n.agent} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-fg">{a.name}</span>
                      <span className="block truncate text-2xs text-muted">{n.label}</span>
                    </span>
                    <StatusIcon status={n.status} className="h-3.5 w-3.5" />
                  </span>
                  {(live || n.status === 'failed') && (
                    <span className="block h-0.5 overflow-hidden rounded-full bg-raised">
                      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${n.progress}%`, background: n.status === 'failed' ? 'rgb(var(--bad))' : agentColor(n.agent) }} />
                    </span>
                  )}
                  {n.attempt > 1 && <span className="absolute -top-2 right-3 rounded-full border border-line bg-surface px-1.5 text-2xs text-warn">try {n.attempt}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
