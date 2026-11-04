import { useState } from 'react';
import { KeyRound, LogOut, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppStore';
import { Button, Card, CardHeader, Field, Input, PageHeader, Row, Segmented, Switch, Tabs } from '../components/ui';

export default function Settings() {
  const nav = useNavigate();
  const { state, setTheme, updateSettings, toast, logout } = useApp();
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(state.user?.name || '');
  const s = state.settings;
  const setApproval = (k, v) => updateSettings({ approval: { ...s.approval, [k]: v } });

  return (
    <div>
      <PageHeader title="Settings" description="Your profile, preferences and the rules that decide when agents must ask you first." />
      <Tabs id="settings" value={tab} onChange={setTab} tabs={[{ value: 'profile', label: 'Profile' }, { value: 'prefs', label: 'Preferences' }, { value: 'approval', label: 'Approvals' }, { value: 'security', label: 'Security' }]} />

      <div className="mt-6 max-w-2xl space-y-5">
        {tab === 'profile' && (
          <Card>
            <CardHeader title="Profile" />
            <div className="space-y-4 p-4">
              <Field label="Name" htmlFor="pname"><Input id="pname" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Email" htmlFor="pemail" hint="Used for sign-in and approval emails."><Input id="pemail" value={state.user?.email || ''} readOnly /></Field>
              <Button variant="primary" onClick={() => toast('Profile saved', 'ok')}>Save changes</Button>
            </div>
          </Card>
        )}

        {tab === 'prefs' && (
          <Card>
            <CardHeader title="Preferences" />
            <div className="divide-y divide-line px-4">
              <Row title="Theme" description="Dark is easier to watch live runs in."><Segmented value={state.theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Row>
              <Row title="Density" description="Spacing in tables and lists."><Segmented value={s.density} onChange={(v) => updateSettings({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Row>
              <Row title="Notify when a task finishes"><Switch checked={s.notifyDone} onChange={(v) => updateSettings({ notifyDone: v })} label="Notify when a task finishes" /></Row>
              <Row title="Notify when approval is needed"><Switch checked={s.notifyApproval} onChange={(v) => updateSettings({ notifyApproval: v })} label="Notify when approval is needed" /></Row>
            </div>
          </Card>
        )}

        {tab === 'approval' && (
          <Card>
            <CardHeader title="Ask me before agents…" subtitle="Applies to tasks set to “Ask me”" />
            <div className="divide-y divide-line px-4">
              <Row title="Call external services" description="APIs outside AgentX, such as Slack or email."><Switch checked={s.approval.externalApi} onChange={(v) => setApproval('externalApi', v)} label="Call external services" /></Row>
              <Row title="Write or save files" description="Create deliverables in connected storage."><Switch checked={s.approval.fileWrite} onChange={(v) => setApproval('fileWrite', v)} label="Write or save files" /></Row>
              <Row title="Send email" description="Always recommended."><Switch checked={s.approval.email} onChange={(v) => setApproval('email', v)} label="Send email" /></Row>
              <Row title="Run code" description="Python in the sandbox."><Switch checked={s.approval.codeExec} onChange={(v) => setApproval('codeExec', v)} label="Run code" /></Row>
            </div>
          </Card>
        )}

        {tab === 'security' && (
          <>
            <Card>
              <CardHeader title="Sign-in" />
              <div className="divide-y divide-line px-4">
                <Row title="Two-factor authentication" description="Ask for a code from your authenticator app."><Switch checked={s.twoFactor} onChange={(v) => updateSettings({ twoFactor: v })} label="Two-factor authentication" /></Row>
                <Row title="API token" description="For calling the AgentX API from scripts."><Button size="sm" onClick={() => toast('Token created. Copy it now; it will not be shown again.', 'info')}><KeyRound className="h-3.5 w-3.5" /> Create token</Button></Row>
                <Row title="This session" description="Signed in on this device."><Button size="sm" onClick={() => (logout(), nav('/login'))}><LogOut className="h-3.5 w-3.5" /> Sign out</Button></Row>
              </div>
            </Card>
            <Card className="border-bad/30">
              <CardHeader title="Danger zone" />
              <div className="px-4"><Row title="Delete all memory" description="Removes preferences, research and run history."><Button size="sm" variant="danger" onClick={() => toast('Connect the backend to delete stored memory', 'warn')}><Trash2 className="h-3.5 w-3.5" /> Delete memory</Button></Row></div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
