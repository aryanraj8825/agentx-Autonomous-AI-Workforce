import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, PlusCircle, Bot, GitBranch, History, Brain, Plug, LineChart, Settings } from 'lucide-react';
import Logo from './Logo';
import { cn } from '../../lib/cn';
import { useDerived } from '../../store/AppStore';
import { AGENT_LIST, agentColor } from '../../lib/agents';
import { Dot } from '../ui';

const GROUPS = [
  {
    label: 'Work',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/new', label: 'New task', icon: PlusCircle },
      { to: '/tasks', label: 'Task history', icon: History },
    ],
  },
  {
    label: 'Agents',
    items: [
      { to: '/agents', label: 'Agent workspace', icon: Bot },
      { to: '/workflow', label: 'Workflow studio', icon: GitBranch },
      { to: '/memory', label: 'AI memory', icon: Brain },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Plug },
      { to: '/analytics', label: 'Analytics', icon: LineChart },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ onNavigate }) {
  const { working, active } = useDerived();
  return (
    <div className="flex h-full w-60 flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Logo />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">AgentX</div>
          <div className="text-2xs text-muted">Autonomous AI workforce</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3" aria-label="Main">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1 px-2.5 text-xs font-medium text-faint">{g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink to={it.to} end={it.end} onClick={onNavigate} className="relative block">
                    {({ isActive }) => (
                      <span className={cn('relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition', isActive ? 'text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}>
                        {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-raised" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                        {isActive && <span className="absolute -left-2.5 top-2 h-5 w-0.5 rounded-full bg-accent" />}
                        <it.icon className="relative h-4 w-4" />
                        <span className="relative">{it.label}</span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-bg p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-fg">Workforce</span>
            <span className="text-muted tabular">{Object.keys(working).length}/7 active</span>
          </div>
          <div className="mt-2.5 flex gap-1.5" aria-label="Agent activity">
            {AGENT_LIST.map((a) => (
              <span key={a.id} title={`${a.name}: ${working[a.id] ? 'working' : 'idle'}`} className="grid h-5 flex-1 place-items-center">
                <Dot color={working[a.id] ? agentColor(a.id) : 'rgb(var(--line-strong))'} pulse={!!working[a.id]} />
              </span>
            ))}
          </div>
          <div className="mt-2 text-2xs text-muted">{active.length ? `${active.length} task${active.length > 1 ? 's' : ''} in progress` : 'All agents idle'}</div>
        </div>
      </div>
    </div>
  );
}
