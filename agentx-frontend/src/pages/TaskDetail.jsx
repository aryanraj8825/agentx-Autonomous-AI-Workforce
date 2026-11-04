import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Square, ShieldQuestion, Check, X, Coins, Timer, Repeat, Cpu, Paperclip } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Button, Card, CardHeader, ProgressBar, StatusBadge, Tabs, EmptyState } from '../components/ui';
import WorkflowGraph from '../components/workflow/WorkflowGraph';
import { Timeline, LogStream, MessageFeed, Deliverables, EvidenceTable, NodeInspector } from '../components/workflow/Panels';
import { fmtDateTime, fmtDuration, fmtNumber, fmtUsd } from '../lib/format';
import { AGENTS } from '../lib/agents';

function ApprovalCard({ task, node, onApprove, onReject }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warn/15 text-warn"><ShieldQuestion className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">Approval needed: {node.approval.title}</h3>
          <p className="mt-1 text-[13px] text-muted">{node.approval.detail}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div><dt className="inline text-muted">Requested by </dt><dd className="inline font-medium text-fg">{AGENTS[node.agent].name}</dd></div>
            <div><dt className="inline text-muted">Risk </dt><dd className="inline font-medium capitalize text-fg">{node.approval.risk}</dd></div>
            <div><dt className="inline text-muted">Tool </dt><dd className="inline font-mono text-fg">files.generate</dd></div>
          </dl>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={onApprove}><Check className="h-4 w-4" /> Approve</Button>
            <Button onClick={onReject}><X className="h-4 w-4" /> Reject and stop</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, approve, reject, cancel, retry } = useApp();
  const task = state.tasks.find((t) => t.id === id);
  const [tab, setTab] = useState('logs');
  const [sel, setSel] = useState(null);
  const finished = task && ['completed', 'failed', 'cancelled'].includes(task.status);

  useEffect(() => {
    if (task?.status === 'completed') setTab((t) => (t === 'logs' ? 'deliverables' : t));
  }, [task?.status]);

  if (!task)
    return (
      <Card>
        <EmptyState title="Task not found" description="It may have been deleted." action={<Button onClick={() => nav('/tasks')}>Back to task history</Button>} />
      </Card>
    );

  const waiting = task.nodes.find((n) => n.status === 'awaiting_approval');
  const metrics = [
    [Timer, 'Duration', fmtDuration(task.metrics.durationMs)],
    [Cpu, 'Tokens', fmtNumber(task.metrics.tokens)],
    [Coins, 'Cost', fmtUsd(task.metrics.cost)],
    [Repeat, 'Retries', task.metrics.retries],
  ];

  return (
    <div>
      <Link to="/tasks" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Task history
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{task.prompt}</p>
          <p className="mt-1 font-mono text-xs text-faint">{task.id} · started {fmtDateTime(task.createdAt)}</p>
          {task.attachments?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {task.attachments.map((f) => (
                <span key={f.name} className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-xs text-muted"><Paperclip className="h-3 w-3" />{f.name}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!finished && <Button variant="danger" onClick={() => cancel(task.id)}><Square className="h-3.5 w-3.5" /> Cancel task</Button>}
          {finished && task.status !== 'completed' && <Button variant="primary" onClick={() => retry(task.id)}><RotateCcw className="h-4 w-4" /> Retry task</Button>}
          {task.status === 'completed' && <Button onClick={() => retry(task.id)}><RotateCcw className="h-4 w-4" /> Run again</Button>}
        </div>
      </div>

      <Card className="mb-5 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Overall progress</span>
          <span className="tabular text-muted">{task.progress}%</span>
        </div>
        <ProgressBar value={task.progress} tone={task.status === 'failed' ? 'bad' : task.status === 'completed' ? 'ok' : 'accent'} className="mt-2" />
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {metrics.map(([Icon, k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <Icon className="h-4 w-4 text-faint" />
              <div>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="text-sm font-semibold tabular">{v}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

      {waiting && (
        <div className="mb-5">
          <ApprovalCard task={task} node={waiting} onApprove={() => approve(task.id, waiting.id)} onReject={() => reject(task.id, waiting.id)} />
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader title="Execution timeline" subtitle={`${task.nodes.filter((n) => n.status === 'completed').length} of ${task.nodes.length} steps done`} />
          <div className="p-3">
            <Timeline nodes={task.nodes} selectedId={sel} onSelect={setSel} />
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Workflow" subtitle="Steps connect when one agent hands work to the next" />
            <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
              <div className="p-3"><WorkflowGraph nodes={task.nodes} selectedId={sel} onSelect={setSel} height={360} /></div>
              <div className="border-t border-line lg:border-l lg:border-t-0"><NodeInspector node={task.nodes.find((n) => n.id === sel)} /></div>
            </div>
          </Card>

          <Card>
            <div className="px-2">
              <Tabs
                id="task"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'logs', label: 'Activity log', count: task.logs.length },
                  { value: 'messages', label: 'Agent messages', count: task.messages.length },
                  { value: 'deliverables', label: 'Deliverables', count: task.deliverables.length },
                  { value: 'evidence', label: 'Evidence', count: task.evidence.length },
                ]}
              />
            </div>
            {tab === 'logs' && <LogStream logs={task.logs} />}
            {tab === 'messages' && <MessageFeed messages={task.messages} />}
            {tab === 'deliverables' && <Deliverables task={task} />}
            {tab === 'evidence' && <EvidenceTable evidence={task.evidence} />}
          </Card>
        </div>
      </div>
    </div>
  );
}
