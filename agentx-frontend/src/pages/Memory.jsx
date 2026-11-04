import { useMemo, useState } from 'react';
import { Brain, Pin, PinOff, Plus, Search, Trash2, Sparkles } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Tabs, Textarea, Select } from '../components/ui';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';

const TYPES = { preference: 'Preference', research: 'Research', history: 'Run history' };

/** Demo "semantic" ranking: word overlap. In production this is a Qdrant vector query. */
function score(m, q) {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  const text = `${m.title} ${m.text} ${m.tags.join(' ')}`.toLowerCase();
  const hit = words.filter((w) => text.includes(w)).length;
  return hit / words.length;
}

export default function Memory() {
  const { state, addMemory, pinMemory, deleteMemory } = useApp();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ type: 'preference', title: '', text: '' });

  const list = useMemo(() => {
    let l = state.memories.filter((m) => tab === 'all' || m.type === tab);
    if (q.trim()) {
      l = l.map((m) => ({ ...m, sim: score(m, q) })).filter((m) => m.sim > 0).sort((a, b) => b.sim - a.sim);
    } else {
      l = [...l].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    }
    return l;
  }, [state.memories, tab, q]);

  const count = (t) => state.memories.filter((m) => m.type === t).length;
  const save = () => {
    addMemory({ type: draft.type, title: draft.title.trim(), text: draft.text.trim(), tags: [] });
    setDraft({ type: 'preference', title: '', text: '' });
    setOpen(false);
  };

  return (
    <div>
      <PageHeader title="AI memory" description="What AgentX remembers: your preferences, useful research and past runs. Agents look this up before they plan." actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add memory</Button>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[['Stored memories', state.memories.length], ['Pinned (always used)', state.memories.filter((m) => m.pinned).length], ['Times recalled', state.memories.reduce((a, m) => a + m.uses, 0)]].map(([k, v]) => (
          <Card key={k} className="p-4"><div className="text-xs text-muted">{k}</div><div className="mt-1.5 text-2xl font-semibold tabular">{v}</div></Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pr-3">
          <Tabs id="mem" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: state.memories.length }, { value: 'preference', label: 'Preferences', count: count('preference') }, { value: 'research', label: 'Research', count: count('research') }, { value: 'history', label: 'Run history', count: count('history') }]} />
          <div className="relative my-2 w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by meaning, e.g. funding sources" className="pl-9" aria-label="Search memory" />
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={Brain} title={q ? 'No related memories' : 'Nothing stored here yet'} description={q ? 'Try different words, or add this as a new memory.' : 'Completed tasks add research and run history automatically.'} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id} className="flex gap-4 px-4 py-4">
                <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', m.pinned ? 'bg-accent/15 text-accent-text' : 'bg-raised text-muted')}>
                  {m.type === 'preference' ? <Sparkles className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-[13px] font-semibold">{m.title}</h3>
                    <span className="text-xs text-muted">{TYPES[m.type]}</span>
                    {m.sim != null && <span className="text-xs tabular text-accent-text">{Math.round(m.sim * 100)}% match</span>}
                  </div>
                  <p className="mt-1 max-w-2xl text-[13px] text-muted">{m.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
                    {m.tags.map((t) => <span key={t} className="rounded bg-raised px-1.5 py-0.5 text-muted">{t}</span>)}
                    <span>Added {timeAgo(m.createdAt)} · recalled {m.uses}×</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <button onClick={() => pinMemory(m.id)} aria-label={m.pinned ? 'Unpin memory' : 'Pin memory'} title={m.pinned ? 'Unpin' : 'Pin so it is always used'} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">{m.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</button>
                  <button onClick={() => deleteMemory(m.id)} aria-label="Delete memory" title="Delete" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-bad/10 hover:text-bad"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add memory" description="Agents can use this in future tasks." footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!draft.title.trim() || !draft.text.trim()} onClick={save}>Save memory</Button></>}>
        <div className="space-y-4">
          <Field label="Type" htmlFor="mtype"><Select id="mtype" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Title" htmlFor="mtitle"><Input id="mtitle" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Report style" /></Field>
          <Field label="What should be remembered?" htmlFor="mtext"><Textarea id="mtext" rows={4} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Always include an executive summary first." /></Field>
        </div>
      </Modal>
    </div>
  );
}
