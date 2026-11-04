# AgentX backend

FastAPI + LangGraph multi-agent engine for the AgentX frontend. Seven agents with their own tools and permissions
plan, research, analyse, build, write and review work, pause for human approval, retry on failure, remember
across tasks, and stream everything live over WebSockets.

```
React ──REST──▶ FastAPI ──▶ Orchestrator ──▶ Runner (LangGraph | native)
  ▲               │              │                 │ parallel fan-out / fan-in
  └──WebSocket────┤ Hub ◀── Event bus (local | Redis)      ▼
                  │              ▲            n1 Supervisor → n2 Planner → n3 ┐
   MongoDB ◀──────┤              │                                      n4 ┴▶ n5 Analyst
   Qdrant  ◀──────┘   control: approve / reject / cancel                       ├▶ n6 Executor ┐
                                                                                └▶ n7 Writer  ┴▶ n8 Reviewer ⇄ Writer → n9 Supervisor
```

## Run it

**Zero setup (mock LLM, in-memory storage, no network):**
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m scripts.demo_offline          # one full task in the terminal
cp .env.example .env && uvicorn app.main:app --reload   # API on :8000, docs at /docs
pytest
```
**Real models:** set `GEMINI_API_KEY` (and `TAVILY_API_KEY` for web search). **Persistence:** set `MONGO_URL`, `QDRANT_URL`.
**Everything in containers** (API + Celery worker + Mongo + Qdrant + Redis): `docker compose up --build`.

The first account registered becomes `admin`. Sign-up is open; put the API behind your own auth or disable
`/api/auth/register` for private deployments.

## How a task runs

| Step | Agent | What it really does |
|---|---|---|
| n1 | Supervisor | Turns the prompt into a structured objective |
| n2 | Planner | Reads pinned + relevant memories, writes two parallel research branches, an analysis focus and a report outline |
| n3, n4 | Researcher ×2 (parallel) | Search → fetch pages (SSRF-guarded) → extract facts with source URL and confidence. Facts citing URLs the model invented are dropped |
| n5 | Analyst | Computes statistics in a resource-limited Python subprocess; model writes insights that must cite real evidence ids |
| n6 | Executor | **Approval checkpoint.** Writes CSV / JSON / XLSX / plan files; optional Slack post |
| n7 | Writer | Markdown report that must cite `[E#]`; the *Sources* section is generated from evidence, never by the model |
| n8 | Reviewer | Deterministic checks (unknown citations, uncited numbers, missing sections) + model judge. Sends the draft back to the Writer up to `MAX_REVISIONS` times; unresolved issues are listed under *Known limitations* |
| n9 | Supervisor | Assembles `report.md` and `report.pdf`; the orchestrator then stores a run summary and the strongest findings in memory |

Failures retry per agent (`maxRetries`, configurable in the UI) with backoff and a changed strategy (fewer queries,
no page fetch, "previous attempt failed because…" in the prompt). Token budget overruns, rejections and
cancellations are not retried. Restarting the API marks orphaned runs `failed` so the user can press Retry.

## API (all under `/api`, JWT bearer; every query is scoped to the caller)

| | |
|---|---|
| `POST /auth/register` `POST /auth/login` `GET /auth/me` | `{token, user}`; login is throttled |
| `POST /plan/preview` | DAG preview for the New Task page |
| `POST /tasks` `GET /tasks` `GET /tasks/{id}` | create (429 over the concurrent-task limit), list (`status`, `q`, `limit`, `skip`), detail with logs/messages/`sharedState` |
| `POST /tasks/{id}/cancel \| retry \| approve \| reject` | approve/reject take `{nodeId}` |
| `DELETE /tasks/{id}` `POST /tasks/delete` | finished tasks only; removes files and indexed documents |
| `GET /tasks/{id}/files/{name}` `POST /uploads` | authenticated download; upload txt/md/csv/tsv/json/log/pdf for the Researcher |
| `GET /agents` `PATCH /agents/{id}/config` | definitions, tools/permissions, live stats, model/temperature/retries/enabled |
| `GET/POST/DELETE /memory` `PATCH /memory/{id}/pin` `POST /memory/search` | semantic search via Qdrant |
| `GET /integrations` `POST /integrations/{id}/connect` `DELETE /integrations/{id}` | credentials encrypted at rest, never returned |
| `GET /analytics?days=` `GET/PUT /settings` `GET /notifications` `POST /notifications/read` | |
| `GET /healthz` `GET /readyz` | liveness / dependencies |

**WebSocket** `/ws?token=<jwt>` → `task.updated` (task without logs/messages), `log.added`, `message.added`,
`notification`. Task JSON matches the frontend's shape (camelCase) plus `error`, `summary`, node `params`.
`frontend-adapter/` has a ready `api.js`, `socket.js` and the store changes needed.

## Data model

MongoDB collections: `users`, `tasks` (nodes = subtasks + workflow, logs, messages, evidence, shared `state` embedded),
`memories`, `integrations`, `agent_configs`, `settings`, `usage_metrics` (one row per agent step), `documents`
(uploads), `notifications`. Qdrant holds memory and document-chunk vectors, always filtered by `userId`.

## Security notes

- Passwords: scrypt. JWT HS256 with required `exp`; production refuses a default/short `JWT_SECRET` and the mock LLM.
- Other users' tasks, files, memories and uploads return 404, never 403. Tested.
- Integration secrets: Fernet-encrypted with `SECRET_KEY`; production refuses to start without `cryptography`.
- Web content and uploads are wrapped in `<source>` tags with an instruction to treat them as data, and model output is
  validated structurally (invented URLs and unknown evidence ids are discarded). That reduces prompt-injection impact; it
  cannot eliminate it, which is why file writes and external posts sit behind approval.
- `web.fetch` blocks private/loopback/link-local addresses, odd ports and credentials, and re-checks every redirect.
- The Python sandbox limits CPU, memory, time and environment but is **not** a hardened boundary and has no kernel network
  isolation. The Analyst only runs a fixed trusted script; model-written code stays off (`ENABLE_LLM_CODE_EXEC=false`).
  For untrusted code add gVisor/Firecracker or a network-less container.
- CSV/XLSX cells starting with `= + - @` are neutralised. CORS and WebSocket Origin are allow-listed.

## Known limits

- `RUN_MODE=inline` is for a single API instance. For several instances or restarts-without-failure use `celery`
  (runs still fail-and-retry on worker crash; LangGraph checkpoints here are in-memory — swap in a Mongo/Postgres saver).
- Rate limiting for login is per-process. Use a gateway or Redis-backed limiter when scaled out.
- GitHub, Drive and SMTP integrations store credentials but no agent tool uses them yet; Slack (webhook) is wired.
- Model prices in `app/llm/base.py` are approximations; check them before trusting cost figures.
- No 2FA enforcement: the `twoFactor` setting is stored only.
