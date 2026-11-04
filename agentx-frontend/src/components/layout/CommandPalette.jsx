import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, LayoutDashboard, PlusCircle, Bot, GitBranch, History, Brain, Plug, LineChart, Settings, Moon, FileText } from 'lucide-react';
import { Modal, Kbd } from '../ui';
import { useApp } from '../../store/AppStore';

export default function CommandPalette({ open, onClose }) {
  const nav = useNavigate();
  const { state, setTheme } = useApp();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const base = [
      { label: 'New task', icon: PlusCircle, run: () => nav('/new') },
      { label: 'Overview', icon: LayoutDashboard, run: () => nav('/') },
      { label: 'Agent workspace', icon: Bot, run: () => nav('/agents') },
      { label: 'Workflow studio', icon: GitBranch, run: () => nav('/workflow') },
      { label: 'Task history', icon: History, run: () => nav('/tasks') },
      { label: 'AI memory', icon: Brain, run: () => nav('/memory') },
      { label: 'Integrations', icon: Plug, run: () => nav('/integrations') },
      { label: 'Analytics', icon: LineChart, run: () => nav('/analytics') },
      { label: 'Settings', icon: Settings, run: () => nav('/settings') },
      { label: `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`, icon: Moon, run: () => setTheme(state.theme === 'dark' ? 'light' : 'dark') },
    ];
    const tasks = state.tasks.slice(0, 8).map((t) => ({ label: t.title, hint: t.id, icon: FileText, run: () => nav(`/tasks/${t.id}`) }));
    return [...base, ...tasks];
  }, [state.tasks, state.theme, nav, setTheme]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => (i.label + (i.hint || '')).toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => setIdx(0), [q]);

  const run = (item) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(i + 1, results.length - 1)));
    if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)));
    if (e.key === 'Enter') run(results[idx]);
  };

  return (
    <Modal open={open} onClose={onClose} title="Search" width="max-w-xl">
      <div onKeyDown={onKey} className="-mx-5 -my-4">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3">
          <Search className="h-4 w-4 text-muted" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, tasks and actions" className="w-full bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none" aria-label="Search" />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {results.map((r, i) => (
            <li key={r.label + i}>
              <button onClick={() => run(r)} onMouseEnter={() => setIdx(i)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${i === idx ? 'bg-raised text-fg' : 'text-muted'}`}>
                <r.icon className="h-4 w-4" />
                <span className="flex-1 truncate">{r.label}</span>
                {r.hint && <span className="font-mono text-2xs text-faint">{r.hint}</span>}
                {i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-faint" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-xs text-muted">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to move</span>
          <span><Kbd>Enter</Kbd> to open</span>
        </div>
      </div>
    </Modal>
  );
}
