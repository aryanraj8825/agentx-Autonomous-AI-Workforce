import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, X, UploadCloud, Wand2 } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { Button, Card, CardHeader, PageHeader, Switch, Textarea, Segmented, Row, AgentAvatar } from '../components/ui';
import { TEMPLATES, buildWorkflow, classifyPrompt } from '../lib/workflow';
import { iconFor } from '../lib/icons';
import { AGENTS } from '../lib/agents';
import { fmtBytes, fmtNumber } from '../lib/format';
import { cn } from '../lib/cn';
import { useLocation } from 'react-router-dom';

const FORMATS = [
  { id: 'report', label: 'Report', hint: 'Markdown and print-to-PDF' },
  { id: 'csv', label: 'CSV', hint: 'Comparison table' },
  { id: 'xlsx', label: 'Excel', hint: 'Spreadsheet with charts' },
  { id: 'plan', label: 'Project plan', hint: 'Tasks and milestones' },
];

export default function NewTask() {
  const nav = useNavigate();
  const loc = useLocation();
  const { createTask, state } = useApp();
  const fileRef = useRef(null);
  const [prompt, setPrompt] = useState(loc.state?.prompt || '');
  const [template, setTemplate] = useState(null);
  const [formats, setFormats] = useState(['report', 'csv']);
  const [autonomy, setAutonomy] = useState('ask');
  const [useMemory, setUseMemory] = useState(true);
  const [budget, setBudget] = useState(60000);
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);

  const kind = classifyPrompt(prompt);
  const plan = useMemo(() => buildWorkflow(kind, { autonomy }), [kind, autonomy]);
  const agents = [...new Set(plan.map((n) => n.agent))];
  const valid = prompt.trim().length >= 12;
  const pinned = state.memories.filter((m) => m.pinned).length;

  const addFiles = (list) =>
    setFiles((f) => [...f, ...Array.from(list).map((x) => ({ name: x.name, size: x.size }))].slice(0, 6));


  const submitAndOpen = () => {
    const nextId = `TSK-${state.nextTaskNo}`;
    createTask({ prompt: prompt.trim(), kind, options: { formats, autonomy, useMemory, tokenBudget: budget }, attachments: files });
    nav(`/tasks/${nextId}`);
  };

  return (
    <div>
      <PageHeader title="New task" description="Describe the outcome you want. AgentX plans the steps, assigns agents and asks you before anything consequential." />

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <div className="p-4">
              <label htmlFor="goal" className="mb-2 block text-sm font-semibold">What should AgentX get done?</label>
              <Textarea id="goal" rows={6} value={prompt} onChange={(e) => (setPrompt(e.target.value), setTemplate(null))} placeholder="Example: Research the top 10 AI startups in India, compare their products, funding and business models, and prepare a market research report." />
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{valid ? 'Ready to plan' : 'Add a little more detail to continue'}</span>
                <span className="tabular">{prompt.length} characters</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {TEMPLATES.filter((t) => t.prompt).map((t) => {
                  const Icon = iconFor(t.icon);
                  return (
                    <button key={t.id} onClick={() => (setPrompt(t.prompt), setTemplate(t.id))} className={cn('inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition', template === t.id ? 'border-accent-text text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg')}>
                      <Icon className="h-3.5 w-3.5" /> {t.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Deliverables" subtitle="Choose what you want back" />
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {FORMATS.map((f) => {
                const on = formats.includes(f.id);
                return (
                  <button key={f.id} role="checkbox" aria-checked={on} onClick={() => setFormats((x) => (on ? x.filter((i) => i !== f.id) : [...x, f.id]))} className={cn('flex items-center justify-between rounded-lg border px-3.5 py-3 text-left transition', on ? 'border-accent-text bg-accent/5' : 'border-line hover:border-line-strong')}>
                    <span>
                      <span className="block text-[13px] font-medium">{f.label}</span>
                      <span className="block text-xs text-muted">{f.hint}</span>
                    </span>
                    <span className={cn('grid h-4 w-4 place-items-center rounded border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>{on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m2.5 6.5 2.3 2.3L9.5 3.8" /></svg>}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Files" subtitle="Optional. Agents can read these while working" />
            <div className="p-4">
              <div
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => (e.preventDefault(), setDrag(false), addFiles(e.dataTransfer.files))}
                className={cn('flex flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center transition', drag ? 'border-accent-text bg-accent/5' : 'border-line-strong')}
              >
                <UploadCloud className="h-6 w-6 text-muted" />
                <p className="mt-2 text-sm">Drop files here or <button className="font-medium text-accent-text underline underline-offset-2" onClick={() => fileRef.current?.click()}>browse</button></p>
                <p className="mt-0.5 text-xs text-muted">PDF, CSV, XLSX, DOCX or TXT, up to 6 files</p>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
              </div>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={f.name + i} className="flex items-center gap-2.5 rounded-lg bg-raised px-3 py-2 text-[13px]">
                      <Paperclip className="h-3.5 w-3.5 text-muted" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-muted tabular">{fmtBytes(f.size)}</span>
                      <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-faint hover:text-fg"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Control" subtitle="How much AgentX can do without asking" />
            <div className="divide-y divide-line px-4">
              <Row title="Approval" description="Ask before writing files or calling external services.">
                <Segmented value={autonomy} onChange={setAutonomy} options={[{ value: 'ask', label: 'Ask me' }, { value: 'autonomous', label: 'Fully autonomous' }]} />
              </Row>
              <Row title="Use memory" description={`Use ${pinned} pinned memories and relevant past research.`}>
                <Switch checked={useMemory} onChange={setUseMemory} label="Use memory" />
              </Row>
              <Row title="Token budget" description="The task stops if it reaches this limit.">
                <div className="flex items-center gap-3">
                  <input type="range" min={20000} max={200000} step={10000} value={budget} onChange={(e) => setBudget(+e.target.value)} className="w-36 accent-[rgb(var(--accent))]" aria-label="Token budget" />
                  <span className="w-16 text-right text-[13px] font-medium tabular">{fmtNumber(budget / 1000)}k</span>
                </div>
              </Row>
            </div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title="Plan preview" subtitle={`${plan.length} steps · ${agents.length} agents`} />
            <ol className="space-y-1 p-3">
              {plan.map((n, i) => (
                <li key={n.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                  <AgentAvatar id={n.agent} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">{n.label}</div>
                    <div className="text-xs text-muted">
                      {AGENTS[n.agent].name}
                      {n.deps.length === 1 && plan.filter((x) => x.deps.join() === n.deps.join()).length > 1 ? ' · runs in parallel' : ''}
                      {n.approval ? ' · asks approval' : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-line p-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-muted"><Wand2 className="h-3.5 w-3.5" /> The Planner may change this once it reads your goal.</div>
              <Button variant="primary" size="lg" className="w-full" disabled={!valid || formats.length === 0} onClick={submitAndOpen}>
                Start task
              </Button>
              {!valid && <p className="mt-2 text-center text-xs text-muted">Describe your goal to start.</p>}
              {valid && formats.length === 0 && <p className="mt-2 text-center text-xs text-warn">Choose at least one deliverable.</p>}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
