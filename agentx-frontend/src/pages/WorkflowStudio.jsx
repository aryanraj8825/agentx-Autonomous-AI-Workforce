import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Braces } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Card, CardHeader, EmptyState, PageHeader, Select, StatusBadge, Tabs, Button } from '../components/ui';
import WorkflowGraph from '../components/workflow/WorkflowGraph';
import { MessageFeed, NodeInspector, LogStream } from '../components/workflow/Panels';
import { AGENT_LIST, agentColor } from '../lib/agents';

export default function WorkflowStudio() {
  const { state } = useApp();
  const [taskId, setTaskId] = useState(() => (state.tasks.find((t) => ['running', 'awaiting_approval'].includes(t.status)) || state.tasks[0])?.id);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('messages');
  const task = state.tasks.find((t) => t.id === taskId) || state.tasks[0];

  // The shared workflow state every agent reads from and writes to.
  const shared = useMemo(
    () => !task ? null : ({
      task_id: task.id,
      status: task.status,
      objective: task.prompt.slice(0, 80) + (task.prompt.length > 80 ? '…' : ''),
      steps: Object.fromEntries(task.nodes.map((n) => [n.id, { agent: n.agent, status: n.status, attempt: n.attempt, depends_on: n.deps }])),
      tokens: task.metrics.tokens,
      evidence_count: task.evidence.length,
    }),
    [task],
  );

  if (!task)
    return (
      <Card>
        <EmptyState title="No workflows yet" description="Start a task and its agent workflow will be drawn here." />
      </Card>
    );

  return (
    <div>
      <PageHeader
        title="Workflow studio"
        description="See how agents hand work to each other. Animated links show data moving from a finished step into a running one."
        actions={
          <>
            <Select value={task.id} onChange={(e) => (setTaskId(e.target.value), setSel(null))} className="w-72" aria-label="Choose a task">
              {state.tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.id} · {t.title}</option>
              ))}
            </Select>
            <Link to={`/tasks/${task.id}`}><Button>Open task</Button></Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <StatusBadge status={task.status} />
        {AGENT_LIST.map((a) => (
          <span key={a.id} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-sm" style={{ background: agentColor(a.id) }} /> {a.name}
          </span>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          <WorkflowGraph nodes={task.nodes} selectedId={sel} onSelect={setSel} height={440} />
          <Card>
            <div className="px-2">
              <Tabs id="studio" value={tab} onChange={setTab} tabs={[{ value: 'messages', label: 'Agent messages', count: task.messages.length }, { value: 'logs', label: 'Activity log', count: task.logs.length }]} />
            </div>
            {tab === 'messages' ? <MessageFeed messages={task.messages} height={300} /> : <LogStream logs={task.logs} height={300} />}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Step details" />
            <NodeInspector node={task.nodes.find((n) => n.id === sel)} />
          </Card>
          <Card>
            <CardHeader title="Shared workflow state" subtitle="Persisted after every step" action={<Braces className="h-4 w-4 text-faint" />} />
            <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-5 text-muted">{JSON.stringify(shared, null, 2)}</pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
