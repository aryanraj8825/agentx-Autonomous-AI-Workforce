# AgentX – Autonomous AI Workforce (frontend)

React 18 · Vite · Tailwind CSS · Framer Motion · Recharts · React Router

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Sign in with any email and password (demo mode).

## Pages

| Route | Page |
|---|---|
| `/` | Overview: stats, running tasks, agent status, activity |
| `/new` | New task: goal, templates, deliverables, files, approval mode, plan preview |
| `/tasks` | Task history: search, filter, sort, export CSV, delete, retry |
| `/tasks/:id` | Live task: timeline, workflow graph, logs, agent messages, deliverables, evidence, approvals |
| `/agents` | Agent workspace: tools, permissions, inputs/outputs, config, stats |
| `/workflow` | Workflow studio: animated agent graph, shared state, message feed |
| `/memory` | AI memory: pin, search, add, delete |
| `/integrations` | Connect and configure tools |
| `/analytics` | Tokens, cost, agent performance, outcomes |
| `/settings` | Profile, preferences, approval rules, security |

Also: dark/light theme, Ctrl/Cmd+K command palette, notifications, toasts, responsive sidebar.

## Structure

```
src/
  lib/          agents, workflow templates, demo engine, seed data, reports
  store/        AppStore.jsx (reducer + context + simulation clock)
  components/   ui primitives, layout, workflow graph and panels
  pages/        one file per route
  hooks/        useChartColors (theme-aware chart colours)
```

## Demo mode

`src/lib/engine.js` simulates the backend: parallel steps, a rate-limit failure with automatic retry,
a human approval checkpoint, a Reviewer sending work back to the Writer, then deliverables and evidence.
Use "Demo speed" in the top bar to speed it up. All figures and company names in generated reports are placeholders.

## Connecting the backend (FastAPI + LangGraph)

The UI reads one task shape (see `makeHistoricTask` in `src/lib/seed.js`):
`{ id, title, prompt, status, nodes[], logs[], messages[], deliverables[], evidence[], metrics }`.

1. Replace the `TICK` interval in `AppStore.jsx` with a WebSocket (`VITE_WS_URL`) that dispatches:
   `task.updated` (full task), `node.updated`, `log.added`, `message.added`, `approval.requested`.
2. Replace the `createTask`, `approve`, `reject`, `cancel`, `retry` calls with REST calls
   (`POST /api/tasks`, `POST /api/tasks/{id}/approve`, …) using the JWT from `/api/auth/login`.
3. Load tasks, memories and integrations with `GET` requests on mount instead of `seedTasks()`.
