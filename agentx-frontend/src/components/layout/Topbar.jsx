import { Link, useNavigate } from 'react-router-dom';
import { Bell, Menu as MenuIcon, Moon, Search, Sun, LogOut, User, Settings, CheckCircle2, AlertTriangle, XCircle, ShieldQuestion } from 'lucide-react';
import { Button, IconButton, Kbd, Menu, MenuItem, Segmented } from '../ui';
import { useApp } from '../../store/AppStore';
import { timeAgo } from '../../lib/format';

const ICON = { done: CheckCircle2, warn: AlertTriangle, fail: XCircle, approval: ShieldQuestion };
const TONE = { done: 'text-ok', warn: 'text-warn', fail: 'text-bad', approval: 'text-warn' };

export default function Topbar({ onMenu, onSearch }) {
  const nav = useNavigate();
  const { state, setTheme, setSpeed, readNotifications, logout } = useApp();
  const unread = state.notifications.filter((n) => !n.read).length;
  const initials = (state.user?.name || 'U').split(' ').map((p) => p[0]).join('').slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-8">
      <IconButton label="Open menu" onClick={onMenu} className="lg:hidden">
        <MenuIcon className="h-5 w-5" />
      </IconButton>

      <button onClick={onSearch} className="flex h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[13px] text-faint transition hover:border-line-strong">
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search pages and tasks</span>
        <span className="hidden items-center gap-1 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-2 md:flex" title="Demo simulation speed">
          <span className="text-xs text-muted">Demo speed</span>
          <Segmented size="sm" value={state.speed} onChange={setSpeed} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} />
        </div>

        <Menu
          width="w-96"
          trigger={
            <IconButton label="Notifications" className="relative" onClick={() => unread && setTimeout(readNotifications, 1500)}>
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">{unread}</span>}
            </IconButton>
          }
        >
          <div className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-muted">Notifications</div>
          <ul className="max-h-96 overflow-y-auto">
            {state.notifications.map((n) => {
              const Icon = ICON[n.kind] || CheckCircle2;
              return (
                <li key={n.id}>
                  <button onClick={() => n.taskId && nav(`/tasks/${n.taskId}`)} className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left hover:bg-raised">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[n.kind]}`} />
                    <span className="flex-1">
                      <span className={`block text-[13px] ${n.read ? 'text-muted' : 'text-fg'}`}>{n.text}</span>
                      <span className="text-xs text-faint">{timeAgo(n.ts)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Menu>

        <IconButton label={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(state.theme === 'dark' ? 'light' : 'dark')}>
          {state.theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </IconButton>

        <Button variant="primary" size="md" onClick={() => nav('/new')} className="hidden sm:inline-flex">
          New task
        </Button>

        <Menu
          trigger={
            <button aria-label="Account menu" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-raised text-xs font-semibold text-fg hover:border-line-strong">
              {initials}
            </button>
          }
        >
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <div className="text-[13px] font-medium">{state.user?.name}</div>
            <div className="text-xs text-muted">{state.user?.email}</div>
          </div>
          <div className="pt-1.5">
            <MenuItem icon={User} onClick={() => nav('/settings')}>Profile</MenuItem>
            <MenuItem icon={Settings} onClick={() => nav('/settings')}>Settings</MenuItem>
            <MenuItem icon={LogOut} danger onClick={() => (logout(), nav('/login'))}>Sign out</MenuItem>
          </div>
        </Menu>
      </div>
    </header>
  );
}
