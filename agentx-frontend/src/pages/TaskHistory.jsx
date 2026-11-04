import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Search, Trash2, RotateCcw, History as HistoryIcon, ArrowUpDown } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Button, Card, EmptyState, Input, PageHeader, ProgressBar, Select, StatusBadge, Modal } from '../components/ui';
import { download, fmtDateTime, fmtDuration, fmtNumber, fmtUsd } from '../lib/format';
import { cn } from '../lib/cn';

const FILTERS = [
  ['all', 'All'],
  ['running', 'Running'],
  ['awaiting_approval', 'Needs approval'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
  ['cancelled', 'Cancelled'],
];

export default function TaskHistory() {
  const nav = useNavigate();
  const { state, deleteTasks, retry } = useApp();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });
  const [picked, setPicked] = useState([]);
  const [confirm, setConfirm] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = state.tasks.filter((t) => (status === 'all' || t.status === status) && (!s || (t.title + t.prompt + t.id).toLowerCase().includes(s)));
    const val = (t) => ({ createdAt: t.createdAt, tokens: t.metrics.tokens, cost: t.metrics.cost, duration: t.metrics.durationMs, title: t.title }[sort.key]);
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return sort.dir === 'asc' ? r : -r;
    });
  }, [state.tasks, q, status, sort]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));

  const exportCsv = () => {
    const head = ['id', 'title', 'status', 'created', 'duration_s', 'tokens', 'cost_usd'];
    const body = rows.map((t) => [t.id, `"${t.title.replace(/"/g, '""')}"`, t.status, new Date(t.createdAt).toISOString(), Math.round(t.metrics.durationMs / 1000), t.metrics.tokens, t.metrics.cost.toFixed(4)]);
    download('agentx-tasks.csv', [head, ...body].map((r) => r.join(',')).join('\n'), 'text/csv');
  };

  const Th = ({ k, children, className }) => (
    <th className={cn('px-4 py-2.5 font-medium', className)} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-fg">
        {children}<ArrowUpDown className={cn('h-3 w-3', sort.key === k ? 'text-fg' : 'text-faint')} />
      </button>
    </th>
  );

  return (
    <div>
      <PageHeader title="Task history" description="Every task AgentX has run, with its status, cost and outputs." actions={<><Button onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button><Button variant="primary" onClick={() => nav('/new')}>New task</Button></>} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" className="pl-9" aria-label="Search tasks" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Filter by status">
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <span className="text-xs text-muted tabular">{rows.length} of {state.tasks.length}</span>
          {picked.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted">{picked.length} selected</span>
              <Button variant="danger" size="sm" onClick={() => setConfirm(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="No tasks match" description="Try a different search or clear the status filter." action={<Button onClick={() => (setQ(''), setStatus('all'))}>Clear filters</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))} className="accent-[rgb(var(--accent))]" />
                  </th>
                  <Th k="title">Task</Th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <Th k="createdAt">Started</Th>
                  <Th k="duration" className="text-right">Duration</Th>
                  <Th k="tokens" className="text-right">Tokens</Th>
                  <Th k="cost" className="text-right">Cost</Th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((t) => (
                  <tr key={t.id} className="transition hover:bg-raised/40">
                    <td className="px-4 py-3">
                      <input type="checkbox" aria-label={`Select ${t.title}`} checked={picked.includes(t.id)} onChange={() => setPicked((p) => (p.includes(t.id) ? p.filter((i) => i !== t.id) : [...p, t.id]))} className="accent-[rgb(var(--accent))]" />
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <Link to={`/tasks/${t.id}`} className="block truncate font-medium text-fg hover:underline">{t.title}</Link>
                      <span className="font-mono text-xs text-faint">{t.id}</span>
                      {['running', 'awaiting_approval'].includes(t.status) && <ProgressBar value={t.progress} className="mt-1.5 max-w-48" />}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} size="sm" /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDateTime(t.createdAt)}</td>
                    <td className="px-4 py-3 text-right tabular">{fmtDuration(t.metrics.durationMs)}</td>
                    <td className="px-4 py-3 text-right tabular">{fmtNumber(t.metrics.tokens)}</td>
                    <td className="px-4 py-3 text-right tabular">{fmtUsd(t.metrics.cost)}</td>
                    <td className="px-2 py-3">
                      {['failed', 'cancelled'].includes(t.status) && (
                        <button aria-label={`Retry ${t.title}`} title="Retry" onClick={() => retry(t.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg"><RotateCcw className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete ${picked.length} task${picked.length > 1 ? 's' : ''}?`}
        description="Their logs, deliverables and evidence are removed. This cannot be undone."
        footer={<><Button onClick={() => setConfirm(false)}>Keep tasks</Button><Button variant="danger" onClick={() => (deleteTasks(picked), setPicked([]), setConfirm(false))}>Delete tasks</Button></>}
      >
        <ul className="space-y-1 text-[13px] text-muted">
          {picked.slice(0, 5).map((id) => <li key={id}>{state.tasks.find((t) => t.id === id)?.title}</li>)}
          {picked.length > 5 && <li>and {picked.length - 5} more</li>}
        </ul>
      </Modal>
    </div>
  );
}
