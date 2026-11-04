import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Download, ExternalLink, FileText, FileSpreadsheet, FileJson, Flag, Printer } from 'lucide-react';
import { AGENTS, agentColor } from '../../lib/agents';
import { AgentAvatar, AgentChip, Button, EmptyState, ProgressBar, StatusIcon, Modal, Select } from '../ui';
import { cn } from '../../lib/cn';
import { fmtBytes, fmtClock, fmtDuration, fmtNumber, download } from '../../lib/format';
import { buildCsv, buildReport, printableHtml } from '../../lib/reports';

/* ---------- Execution timeline ---------- */
export function Timeline({ nodes, selectedId, onSelect }) {
  return (
    <ol className="relative">
      {nodes.map((n, i) => {
        const sel = selectedId === n.id;
        return (
          <li key={n.id} className="relative pl-9">
            {i < nodes.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-18px)] w-px bg-line" aria-hidden />}
            <span className="absolute left-0 top-2 grid h-[27px] w-[27px] place-items-center rounded-full border border-line bg-surface">
              <StatusIcon status={n.status} className="h-3.5 w-3.5" />
            </span>
            <button onClick={() => onSelect?.(n.id)} className={cn('mb-1 w-full rounded-lg px-3 py-2 text-left transition hover:bg-raised/60', sel && 'bg-raised')}>
              <div className="flex items-center justify-between gap-3">
                <AgentChip id={n.agent} />
                <span className="text-xs tabular text-faint">
                  {n.status === 'completed' ? fmtDuration(n.elapsed) : n.status === 'running' ? `${n.progress}%` : ''}
                </span>
              </div>
              <div className="mt-0.5 text-[13px] text-fg">{n.label}</div>
              {n.status === 'running' && <ProgressBar value={n.progress} className="mt-2" />}
              {n.status === 'awaiting_approval' && <div className="mt-1 text-xs text-warn">Needs your approval</div>}
              {n.status === 'failed' && <div className="mt-1 text-xs text-bad">Failed{n.retryIn != null ? ' · retrying shortly' : ''}</div>}
              {n.attempt > 1 && n.status !== 'failed' && <div className="mt-1 text-xs text-muted">Attempt {n.attempt}</div>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Live log ---------- */
const LEVEL = { info: 'text-muted', success: 'text-ok', warn: 'text-warn', error: 'text-bad' };

export function LogStream({ logs, height = 380, follow = true }) {
  const [agent, setAgent] = useState('all');
  const ref = useRef(null);
  const list = agent === 'all' ? logs : logs.filter((l) => l.agent === agent);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [list.length, follow]);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-xs text-muted tabular">{list.length} entries</span>
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-7 w-40 text-xs" aria-label="Filter by agent">
          <option value="all">All agents</option>
          {Object.values(AGENTS).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </div>
      <div ref={ref} className="overflow-y-auto px-4 py-3 font-mono text-xs leading-6" style={{ maxHeight: height }}>
        {list.length === 0 && <div className="py-8 text-center font-sans text-sm text-muted">No log entries yet.</div>}
        {list.map((l) => (
          <div key={l.id} className="flex gap-3">
            <span className="shrink-0 text-faint tabular">{fmtClock(l.ts)}</span>
            <span className="w-20 shrink-0 truncate font-medium" style={{ color: agentColor(l.agent) }}>{AGENTS[l.agent]?.name}</span>
            <span className={cn('min-w-0 break-words', LEVEL[l.level])}>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Agent messages ---------- */
const MSG_TONE = {
  handoff: 'border-info/30 bg-info/10 text-info',
  result: 'border-ok/30 bg-ok/10 text-ok',
  revision: 'border-warn/30 bg-warn/10 text-warn',
  error: 'border-bad/30 bg-bad/10 text-bad',
};

export function MessageFeed({ messages, height = 380 }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);
  if (!messages.length) return <EmptyState title="No messages yet" description="Agents exchange structured messages as work is handed over." />;
  return (
    <ul ref={ref} className="divide-y divide-line overflow-y-auto" style={{ maxHeight: height }}>
      {messages.map((m) => (
        <li key={m.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <AgentChip id={m.from} />
            <ArrowRight className="h-3 w-3 text-faint" />
            <AgentChip id={m.to} />
            <span className={cn('ml-1 rounded border px-1.5 py-px text-2xs font-medium', MSG_TONE[m.type])}>{m.type}</span>
            <span className="ml-auto text-faint tabular">{fmtClock(m.ts)}</span>
          </div>
          <p className="mt-1.5 text-[13px] text-fg">{m.text}</p>
          {m.payload && (
            <>
              <button onClick={() => setOpen(open === m.id ? null : m.id)} className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
                <ChevronDown className={cn('h-3 w-3 transition', open === m.id && 'rotate-180')} />
                Payload
              </button>
              {open === m.id && <pre className="mt-1.5 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-xs text-muted">{JSON.stringify(m.payload, null, 2)}</pre>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Deliverables ---------- */
const FILE_ICON = { report: FileText, csv: FileSpreadsheet, json: FileJson };

export function Deliverables({ task }) {
  const [preview, setPreview] = useState(false);
  if (!task.deliverables.length)
    return <EmptyState icon={FileText} title="Deliverables appear here" description="Files are generated by the Executor and Writer once the Reviewer approves the work." />;

  const get = (d) => {
    if (d.kind === 'report') return [buildReport(task), 'text/markdown'];
    if (d.kind === 'csv') return [buildCsv(task), 'text/csv'];
    return [JSON.stringify(task.evidence, null, 2), 'application/json'];
  };

  return (
    <>
      <ul className="divide-y divide-line">
        {task.deliverables.map((d) => {
          const Icon = FILE_ICON[d.kind] || FileText;
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-muted"><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{d.label}</div>
                <div className="font-mono text-xs text-muted">{d.name} · {fmtBytes(d.size)}</div>
              </div>
              {d.kind === 'report' && <Button size="sm" onClick={() => setPreview(true)}>Preview</Button>}
              <Button size="sm" onClick={() => { const [c, t] = get(d); download(d.name, c, t); }}>
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </li>
          );
        })}
      </ul>
      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Report preview"
        width="max-w-2xl"
        footer={
          <>
            <Button onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(printableHtml(task)); w.document.close(); } }}>
              <Printer className="h-4 w-4" /> Print or save as PDF
            </Button>
            <Button variant="primary" onClick={() => download('report.md', buildReport(task), 'text/markdown')}>Download .md</Button>
          </>
        }
      >
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-fg">{buildReport(task)}</pre>
      </Modal>
    </>
  );
}

/* ---------- Evidence ---------- */
export function EvidenceTable({ evidence }) {
  if (!evidence.length) return <EmptyState title="No evidence yet" description="Each claim is linked to a source and a confidence score when research completes." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-2.5 font-medium">Claim</th>
            <th className="px-4 py-2.5 font-medium">Source</th>
            <th className="px-4 py-2.5 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {evidence.map((e) => (
            <tr key={e.id}>
              <td className="max-w-xs px-4 py-3 align-top">
                <span className="mr-2 font-mono text-xs text-faint">{e.id}</span>
                {e.claim}
                {e.flagged && <span className="ml-2 inline-flex items-center gap-1 text-xs text-warn"><Flag className="h-3 w-3" />Low confidence</span>}
              </td>
              <td className="px-4 py-3 align-top font-mono text-xs text-muted"><span className="inline-flex items-center gap-1">{e.source}<ExternalLink className="h-3 w-3" /></span></td>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full" style={{ width: `${e.confidence * 100}%`, background: e.confidence >= 0.8 ? 'rgb(var(--ok))' : e.confidence >= 0.7 ? 'rgb(var(--info))' : 'rgb(var(--warn))' }} />
                  </div>
                  <span className="tabular text-xs text-muted">{e.confidence.toFixed(2)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Node inspector ---------- */
export function NodeInspector({ node }) {
  if (!node) return <div className="p-4 text-sm text-muted">Select a step in the graph to see its details.</div>;
  const a = AGENTS[node.agent];
  const rows = [
    ['Status', node.status.replace('_', ' ')],
    ['Attempt', node.attempt],
    ['Progress', `${node.progress}%`],
    ['Elapsed', fmtDuration(node.elapsed)],
    ['Tokens', fmtNumber(node.tokens)],
    ['Depends on', node.deps.length ? node.deps.join(', ') : 'none'],
  ];
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <AgentAvatar id={node.agent} size={36} />
        <div>
          <div className="text-sm font-semibold">{a.name}</div>
          <div className="text-xs text-muted">{node.label}</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-medium capitalize tabular">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 text-xs text-muted">Tools</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {a.tools.map((t) => (
          <span key={t.name} className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-2xs text-muted">{t.name}</span>
        ))}
      </div>
    </div>
  );
}
