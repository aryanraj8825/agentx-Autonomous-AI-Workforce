import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Network, Search, ShieldCheck, PenLine } from 'lucide-react';
import Logo from '../components/layout/Logo';
import { Button, Field, Input } from '../components/ui';
import { useApp } from '../store/AppStore';

export default function Login() {
  const { state, login } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('aryan@agentx.dev');
  const [password, setPassword] = useState('demo-password');
  const [busy, setBusy] = useState(false);

  if (state.user) return <Navigate to="/" replace />;

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    // Replace with: POST /api/auth/login → store JWT, then call login(user)
    setTimeout(() => {
      login({ name: 'Aryan Raj', email, role: 'Admin' });
      nav(loc.state?.from || '/', { replace: true });
    }, 500);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <div className="grid-bg absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="text-base font-semibold tracking-tight">AgentX</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">Give the goal. The workforce does the work.</h1>
            <p className="mt-4 text-[15px] text-muted">
              Seven specialised agents plan, research, analyse, build and check each other’s work, and ask you before anything consequential happens.
            </p>
            <ul className="mt-8 space-y-3 text-sm">
              {[
                [Network, 'supervisor', 'Supervisor routes the work'],
                [Search, 'researcher', 'Researchers keep a source for every claim'],
                [PenLine, 'writer', 'Writer drafts, Reviewer sends it back if it is weak'],
                [ShieldCheck, 'reviewer', 'You approve sensitive actions'],
              ].map(([Icon, a, t]) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: `rgb(var(--a-${a}) / 0.14)`, color: `rgb(var(--a-${a}))` }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-fg">{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-faint">Demo build. Outputs are simulated until the backend is connected.</p>
        </div>
      </div>

      <div className="grid place-items-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden"><Logo size={32} /></div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Use any email and password in demo mode.</p>
          </div>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} autoComplete="current-password" />
          </Field>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
