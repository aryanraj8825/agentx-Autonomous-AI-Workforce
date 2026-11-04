import { useState } from 'react';
import { CheckCircle2, AlertTriangle, CircleOff } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Button, Card, Field, Input, Modal, PageHeader, Badge, Segmented } from '../components/ui';
import { iconFor } from '../lib/icons';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';

const HEALTH = {
  ok: { label: 'Healthy', Icon: CheckCircle2, tone: 'text-ok' },
  degraded: { label: 'Slow responses', Icon: AlertTriangle, tone: 'text-warn' },
  off: { label: 'Not connected', Icon: CircleOff, tone: 'text-faint' },
};

export default function Integrations() {
  const { state, toggleIntegration, toast } = useApp();
  const [group, setGroup] = useState('All');
  const [editing, setEditing] = useState(null);
  const groups = ['All', ...new Set(state.integrations.map((i) => i.group))];
  const list = state.integrations.filter((i) => group === 'All' || i.group === group);
  const connected = state.integrations.filter((i) => i.connected).length;

  return (
    <div>
      <PageHeader title="Integrations" description={`${connected} of ${state.integrations.length} connected. Agents can only use tools you connect here, and only with the scopes shown.`} actions={<Segmented value={group} onChange={setGroup} options={groups.map((g) => ({ value: g, label: g }))} />} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((i) => {
          const Icon = iconFor(i.icon);
          const h = HEALTH[i.health];
          return (
            <Card key={i.id} className="flex flex-col p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-raised text-fg"><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{i.name}</h3>
                  <p className="mt-0.5 text-[13px] text-muted">{i.desc}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{i.scopes.map((s) => <Badge key={s} className="font-mono">{s}</Badge>)}</div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <div>
                  <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium', h.tone)}><h.Icon className="h-3.5 w-3.5" />{h.label}</div>
                  {i.lastSync && <div className="mt-0.5 text-xs text-faint">Checked {timeAgo(i.lastSync)}</div>}
                </div>
                {i.connected ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setEditing(i)}>Configure</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleIntegration(i.id, false)}>Disconnect</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => setEditing(i)}>Connect</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.connected ? 'Configure' : 'Connect'} ${editing.name}` : ''}
        description="Credentials are stored encrypted on the server and never shown again."
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!editing.connected) toggleIntegration(editing.id, true); else toast(`${editing.name} settings saved`, 'ok'); setEditing(null); }}>{editing?.connected ? 'Save changes' : 'Connect'}</Button></>}
      >
        {editing && (
          <div className="space-y-4">
            {editing.fields.map((f) => (
              <Field key={f} label={f} htmlFor={`f-${f}`}>
                <Input id={`f-${f}`} type={/key|token|password|string/i.test(f) ? 'password' : 'text'} placeholder={editing.connected ? '••••••••••••' : `Enter ${f.toLowerCase()}`} />
              </Field>
            ))}
            <div>
              <div className="mb-1.5 text-xs font-medium">Permissions requested</div>
              <div className="flex flex-wrap gap-1.5">{editing.scopes.map((s) => <Badge key={s} className="font-mono">{s}</Badge>)}</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
