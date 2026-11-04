"""Starts, supervises, cancels and finalises task runs. One asyncio task per run.

Control messages (approve / reject / cancel) arrive on the bus, so the same code works when the API
and the engine live in different processes (Celery worker + Redis bus)."""
from __future__ import annotations

import asyncio
import logging

from ..realtime.bus import CONTROL
from ..util import now_ms
from .context import RunContext
from .errors import BudgetExceeded, NodeFailed, TaskStopped
from .runner_langgraph import make_runner
from .workflow import ACTIVE, public_task

log = logging.getLogger("agentx.orchestrator")


class Orchestrator:
    def __init__(self, svc):
        self.svc = svc
        self.runner = make_runner(svc.settings.runner)
        self.runs: dict[str, tuple[asyncio.Task, RunContext]] = {}
        self._cancel_reason: dict[str, str] = {}
        svc.bus.subscribe(CONTROL, self.on_control)
        log.info("orchestrator ready (runner=%s)", self.runner.name)

    # ---- lifecycle --------------------------------------------------------------------------
    async def start(self, task_id: str) -> None:
        if task_id in self.runs:
            return
        t = asyncio.create_task(self._run(task_id), name=f"run-{task_id}")
        self.runs[task_id] = (t, None)  # ctx filled in by _run

    async def recover(self) -> int:
        """After a restart nothing is running: mark orphaned tasks failed so users can Retry."""
        n = 0
        for t in await self.svc.db.tasks.find({"status": {"$in": list(ACTIVE)}}):
            if t["id"] in self.runs:
                continue
            for node in t["nodes"]:
                if node["status"] in ("running", "awaiting_approval", "pending", "failed"):
                    node["status"] = "cancelled"
            t.update(status="failed", finishedAt=now_ms(), error="Interrupted by a server restart. Retry to run it again.")
            await self.svc.db.tasks.replace(t["id"], t)
            n += 1
        return n

    async def shutdown(self) -> None:
        for tid, (t, _) in list(self.runs.items()):
            self._cancel_reason[tid] = "restart"
            t.cancel()
        await asyncio.gather(*(t for t, _ in self.runs.values()), return_exceptions=True)

    # ---- control ---------------------------------------------------------------------------
    async def on_control(self, ev: dict) -> None:
        tid = ev.get("taskId")
        run = self.runs.get(tid)
        if not run:
            return
        task, ctx = run
        action = ev.get("action")
        if action == "cancel":
            self._cancel_reason[tid] = "user"
            task.cancel()
        elif action in ("approve", "reject") and ctx:
            ctx.resolve_approval(ev["nodeId"], action == "approve")

    # ---- the run -------------------------------------------------------------------------------
    async def _run(self, task_id: str) -> None:
        svc = self.svc
        task = await svc.db.tasks.get(task_id)
        if not task:
            self.runs.pop(task_id, None)
            return
        ctx = RunContext(task, svc, await svc.agent_config(task["userId"]), await svc.llm_for(task["userId"]))
        self.runs[task_id] = (self.runs[task_id][0], ctx)
        task.update(status="running", startedAt=now_ms(), error=None)
        ctx.log("supervisor", "info", "Task received.")
        try:
            await self._index_attachments(ctx)
            await ctx.publish_task()
            await ctx.save(force=True)
            ctx.start_ticker()
            await self.runner.run(ctx)
            task.update(status="completed", finishedAt=now_ms())
            ctx.log("supervisor", "success", "Task complete. Deliverables are ready.")
            await svc.notify(task["userId"], "done", f"{task['title']} is ready", task_id)
            await self._remember(ctx)
        except asyncio.CancelledError:
            reason = self._cancel_reason.get(task_id, "user")
            self._mark_cancelled(task)
            task.update(status="failed" if reason == "restart" else "cancelled", finishedAt=now_ms(), error="Interrupted by a server restart. Retry to run it again." if reason == "restart" else None)
            ctx.log("supervisor", "warn", "Cancelled by user." if reason == "user" else "Interrupted by server shutdown.")
        except TaskStopped as e:
            self._mark_cancelled(task)
            task.update(status="cancelled", finishedAt=now_ms(), error=str(e))
        except (NodeFailed, BudgetExceeded) as e:
            self._mark_cancelled(task)
            task.update(status="failed", finishedAt=now_ms(), error=str(e))
            ctx.log("supervisor", "error", f"Task stopped: {e}")
            await svc.notify(task["userId"], "fail", f"{task['title']} failed: {e}"[:200], task_id)
        except Exception as e:  # bug or infrastructure fault: fail the task, keep the server alive
            log.exception("task %s crashed", task_id)
            self._mark_cancelled(task)
            task.update(status="failed", finishedAt=now_ms(), error=f"Internal error: {type(e).__name__}")
            await svc.notify(task["userId"], "fail", f"{task['title']} failed unexpectedly", task_id)
        finally:
            ctx.stop_ticker()
            ctx.recompute()
            if task["status"] == "completed":
                task["progress"] = 100
            try:
                await ctx.save(force=True)
                await ctx.emit("task.updated", task=public_task(task))
            finally:
                self.runs.pop(task_id, None)
                self._cancel_reason.pop(task_id, None)

    @staticmethod
    def _mark_cancelled(task: dict) -> None:
        for n in task["nodes"]:
            if n["status"] in ("pending", "running", "awaiting_approval", "failed"):
                n["status"] = "cancelled" if n["status"] != "failed" else "failed"

    async def _index_attachments(self, ctx) -> None:
        for a in ctx.task["attachments"]:
            text = a.get("text")
            if not text and a.get("uploadId"):
                doc = await self.svc.db.documents.get(a["uploadId"])
                text = doc["text"] if doc and doc["userId"] == ctx.user_id else None  # never read another user's upload
            if text:
                n = await self.svc.memory.index_document(ctx.user_id, ctx.task["id"], a["name"], text)
                ctx.log("researcher", "info", f"Indexed {a['name']} ({n} passages).")

    async def _remember(self, ctx) -> None:
        """Write a run summary and the strongest findings to long-term memory."""
        t = ctx.task
        if not t["options"].get("useMemory", True):
            return
        try:
            m = self.svc.memory
            mins = t["metrics"]["durationMs"] / 60000
            await m.add(ctx.user_id, type="history", title=t["title"][:100], text=f"Completed in {mins:.1f} min, {t['metrics']['tokens']:,} tokens, {len(t['evidence'])} evidence items, {t['metrics']['retries']} retries. Objective: {ctx.state['interpret']['objective']}", tags=["run", t["id"]])
            for e in sorted((x for x in t["evidence"] if x["confidence"] >= 0.85), key=lambda x: -x["confidence"])[:3]:
                await m.add(ctx.user_id, type="research", title=e["claim"][:80], text=f"{e['claim']} (source: {e['source']})", tags=["auto", t["id"]])
        except Exception:
            log.exception("could not write memory for %s", t["id"])
