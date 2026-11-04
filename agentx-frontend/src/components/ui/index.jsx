import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, Info, Loader2, X, XCircle, Ban, Clock, ShieldQuestion, CircleDashed } from 'lucide-react';
import { cn } from '../../lib/cn';
import { AGENTS, agentColor } from '../../lib/agents';
import { iconFor } from '../../lib/icons';

/* ---------- Button ---------- */
const BTN = {
  primary: 'bg-accent text-accent-ink hover:brightness-105 active:brightness-95 font-semibold',
  secondary: 'bg-raised text-fg border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-raised',
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/15',
};
const BTN_SIZE = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-[13px] gap-2', lg: 'h-11 px-5 text-sm gap-2' };

export function Button({ variant = 'secondary', size = 'md', loading, className, children, ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition disabled:opacity-50',
        BTN[variant],
        BTN_SIZE[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export const IconButton = ({ label, className, children, ...p }) => (
  <button
    {...p}
    aria-label={label}
    title={label}
    className={cn('inline-grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg', className)}
  >
    {children}
  </button>
);

/* ---------- Card ---------- */
export const Card = ({ className, children, ...p }) => (
  <section {...p} className={cn('rounded-xl border border-line bg-surface', className)}>
    {children}
  </section>
);

export const CardHeader = ({ title, subtitle, action, className }) => (
  <header className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
    </div>
    {action}
  </header>
);

export const PageHeader = ({ title, description, actions }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

/* ---------- Status ---------- */
const STATUS = {
  running: { label: 'Running', tone: 'text-info bg-info/10 border-info/25', Icon: Loader2, spin: true },
  awaiting_approval: { label: 'Needs approval', tone: 'text-warn bg-warn/10 border-warn/25', Icon: ShieldQuestion },
  completed: { label: 'Completed', tone: 'text-ok bg-ok/10 border-ok/25', Icon: CheckCircle2 },
  failed: { label: 'Failed', tone: 'text-bad bg-bad/10 border-bad/25', Icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'text-muted bg-raised border-line', Icon: Ban },
  queued: { label: 'Queued', tone: 'text-muted bg-raised border-line', Icon: Clock },
  pending: { label: 'Pending', tone: 'text-muted bg-raised border-line', Icon: CircleDashed },
};

export function StatusBadge({ status, size = 'md' }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium', s.tone, size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs')}>
      <s.Icon className={cn('h-3 w-3', s.spin && 'animate-spin')} />
      {s.label}
    </span>
  );
}

export const StatusIcon = ({ status, className = 'h-4 w-4' }) => {
  const s = STATUS[status] || STATUS.pending;
  const color = { running: 'text-info', awaiting_approval: 'text-warn', completed: 'text-ok', failed: 'text-bad' }[status] || 'text-faint';
  return <s.Icon className={cn(className, color, s.spin && 'animate-spin')} />;
};

export const Badge = ({ children, className }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-md border border-line bg-raised px-1.5 py-0.5 text-2xs font-medium text-muted', className)}>
    {children}
  </span>
);

/* ---------- Agent identity ---------- */
export function AgentAvatar({ id, size = 32, ring }) {
  const a = AGENTS[id];
  const Icon = iconFor(a.icon);
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-lg"
      style={{ width: size, height: size, background: agentColor(id, 0.14), color: agentColor(id), boxShadow: ring ? `0 0 0 1.5px ${agentColor(id, 0.6)}` : undefined }}
      aria-hidden
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </span>
  );
}

export const AgentChip = ({ id }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: agentColor(id) }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentColor(id) }} />
    {AGENTS[id]?.name}
  </span>
);

/* ---------- Progress ---------- */
export const ProgressBar = ({ value, tone = 'accent', className }) => (
  <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-raised', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div
      className={cn('h-full rounded-full transition-[width] duration-300', { accent: 'bg-accent', ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn' }[tone])}
      style={{ width: `${Math.max(2, value)}%` }}
    />
  </div>
);

/* ---------- Form controls ---------- */
export function Switch({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full border transition', checked ? 'border-accent bg-accent' : 'border-line-strong bg-raised')}
    >
      <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all', checked ? 'left-[18px] bg-accent-ink' : 'left-0.5 bg-muted')} />
    </button>
  );
}

const fieldCls =
  'w-full rounded-lg border border-line bg-bg px-3 text-[13px] text-fg placeholder:text-faint transition hover:border-line-strong focus:border-accent-text focus:outline-none focus:ring-2 focus:ring-accent/20';

export const Input = ({ className, ...p }) => <input {...p} className={cn(fieldCls, 'h-9', className)} />;
export const Textarea = ({ className, ...p }) => <textarea {...p} className={cn(fieldCls, 'py-2.5 leading-relaxed', className)} />;
export const Select = ({ className, children, ...p }) => (
  <select {...p} className={cn(fieldCls, 'h-9 pr-8', className)}>
    {children}
  </select>
);

export const Field = ({ label, hint, children, htmlFor }) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="text-xs font-medium text-fg">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </div>
);

export const Row = ({ title, description, children }) => (
  <div className="flex items-center justify-between gap-6 py-3.5">
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-fg">{title}</div>
      {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('rounded-md px-3 text-xs font-medium transition', size === 'sm' ? 'h-6' : 'h-7', value === o.value ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, id = 'tabs' }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const on = value === t.value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn('relative -mb-px flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition', on ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {t.label}
            {t.count != null && <span className="rounded bg-raised px-1.5 text-2xs tabular text-muted">{t.count}</span>}
            {on && <motion.span layoutId={`${id}-ink`} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Overlays ---------- */
export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn('relative flex max-h-[88vh] w-full flex-col rounded-2xl border border-line bg-surface shadow-pop', width)}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-fg">{title}</h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Menu({ trigger, children, align = 'right', width = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{typeof trigger === 'function' ? trigger(open) : trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn('absolute z-40 mt-2 rounded-xl border border-line bg-surface p-1.5 shadow-pop', width, align === 'right' ? 'right-0' : 'left-0')}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const MenuItem = ({ icon: Icon, children, danger, ...p }) => (
  <button {...p} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-raised', danger ? 'text-bad' : 'text-fg')}>
    {Icon && <Icon className="h-4 w-4 text-muted" />}
    {children}
  </button>
);

/* ---------- Toasts ---------- */
const TOAST_ICON = { ok: Check, warn: AlertTriangle, info: Info, bad: XCircle };
const TOAST_TONE = { ok: 'text-ok', warn: 'text-warn', info: 'text-info', bad: 'text-bad' };

function Toast({ t, onDismiss }) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(t.id), 4500);
    return () => clearTimeout(id);
  }, [t.id, onDismiss]);
  const Icon = TOAST_ICON[t.tone] || Info;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="pointer-events-auto flex w-80 items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-pop"
      role="status"
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TOAST_TONE[t.tone])} />
      <p className="flex-1 text-[13px] text-fg">{t.text}</p>
      <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="text-faint hover:text-fg">
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export const Toaster = ({ toasts, onDismiss }) =>
  createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} t={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );

/* ---------- Misc ---------- */
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    {Icon && (
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-line bg-raised text-muted">
        <Icon className="h-5 w-5" />
      </div>
    )}
    <h3 className="text-sm font-semibold text-fg">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Kbd = ({ children }) => (
  <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-2xs text-muted">{children}</kbd>
);

export const Stat = ({ label, value, sub, icon: Icon, tone }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-muted">{label}</span>
      {Icon && <Icon className="h-4 w-4 text-faint" />}
    </div>
    <div className={cn('mt-2 text-[26px] font-semibold leading-none tracking-tight tabular', tone)}>{value}</div>
    {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
  </Card>
);

export const Dot = ({ color, pulse }) => (
  <span className="relative inline-flex h-2 w-2">
    {pulse && <span className="absolute inset-0 animate-pulseRing rounded-full" style={{ background: color }} />}
    <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
  </span>
);
