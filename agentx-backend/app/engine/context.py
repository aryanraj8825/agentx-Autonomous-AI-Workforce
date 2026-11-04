"""RunContext: everything an agent may touch during one task run, and the only place that mutates
the task document. Agents get their own tools/permissions through it, never raw services."""
from __future__ import annotations

import asyncio
import math
from typing import Any

from ..llm.base import LLMResult, cost_usd
from ..util import new_id, now_ms
from .errors import BudgetExceeded, TaskStopped
from .workflow import public_task

MAX_LOGS, MAX_MESSAGES = 2000, 500


class RunContext:
    def __init__(self, task: dict, svc, agent_cfg: dict[str, dict], llm):
        self.task, self.svc, self._cfg, self.llm = task, svc, agent_cfg, llm
        self.user_id = task["userId"]
        self.state: dict[str, Any] = task.setdefault("state", {})
        self._dirty = True
        self._approvals: dict[str, asyncio.Future] = {}
        self._ticker: asyncio.Task | None = None

    # ---- lookups ---------------------------------------------------------------------------
    def node(self, id: str) -> dict:
        return next(n for n in self.task["nodes"] if n["id"] == id)

    def cfg(self, agent: str) -> dict:
        return self._cfg[agent]

    @property
    def options(self) -> dict:
        return self.task["options"]

    # ---- events ----------------------------------------------------------------------------
    async def emit(self, type: str, **data) -> None:
        from ..realtime.bus import EVENTS

        await self.svc.bus.publish(EVENTS, {"type": type, "userId": self.user_id, "taskId": self.task["id"], **data})

    async def publish_task(self) -> None:
        self.recompute()
        await self.emit("task.updated", task=public_task(self.task))

    def touch(self) -> None:
        self._dirty = True

    async def save(self, force: bool = False) -> None:
        if self._dirty or force:
            self._dirty = False
            await self.svc.db.tasks.replace(self.task["id"], self.task)

    # ---- logs and agent messages ----------------------------------------------------------------
    def log(self, agent: str, level: str, text: str) -> None:
        t = self.task
        entry = {"id": f"{t['id']}-L{len(t['logs'])}", "ts": now_ms(), "agent": agent, "level": level, "text": text[:600]}
        t["logs"].append(entry)
        if len(t["logs"]) > MAX_LOGS:
            del t["logs"][: len(t["logs"]) - MAX_LOGS]
        self._dirty = True
        asyncio.get_running_loop().create_task(self.emit("log.added", log=entry))

    def message(self, frm: str, to: str, type: str, text: str, payload: dict | None = None) -> None:
        t = self.task
        m = {"id": f"{t['id']}-M{len(t['messages'])}", "ts": now_ms(), "from": frm, "to": to, "type": type, "text": text[:400], "payload": payload}
        t["messages"].append(m)
        if len(t["messages"]) > MAX_MESSAGES:
            del t["messages"][: len(t["messages"]) - MAX_MESSAGES]
        self._dirty = True
        asyncio.get_running_loop().create_task(self.emit("message.added", message=m))

    # ---- models ------------------------------------------------------------------------------
    def _account(self, node: dict, res: LLMResult) -> None:
        m = self.task["metrics"]
        node["tokens"] += res.tokens
        m["tokens"] += res.tokens
        m["cost"] += cost_usd(res.model, res.tokens_in, res.tokens_out)
        node.setdefault("_in", 0)
        node["_in"] += res.tokens_in
        self._dirty = True
        budget = self.options.get("tokenBudget")
        if budget and m["tokens"] > budget:
            raise BudgetExceeded(f"Token budget of {budget:,} reached")

    async def ask_json(self, node: dict, purpose: str, system: str, prompt: str, context: dict | None = None) -> Any:
        cfg = self.cfg(node["agent"])
        res = await self.llm.generate(purpose=purpose, system=system, prompt=prompt, model=cfg["model"], temperature=cfg["temperature"], json_mode=True, context=context)
        self._account(node, res)
        return res.data

    async def ask_text(self, node: dict, purpose: str, system: str, prompt: str, context: dict | None = None) -> str:
        cfg = self.cfg(node["agent"])
        res = await self.llm.generate(purpose=purpose, system=system, prompt=prompt, model=cfg["model"], temperature=cfg["temperature"], json_mode=False, context=context)
        self._account(node, res)
        return res.text.strip()

    # ---- shared artefacts --------------------------------------------------------------------
    def add_evidence(self, claim: str, source: str, quote: str, confidence: float, branch: str) -> str | None:
        claim = " ".join(claim.split())[:300]
        if not claim or not source:
            return None
        key = claim.lower()
        for e in self.task["evidence"]:
            if e["claim"].lower() == key:
                return e["id"]
        conf = max(0.0, min(1.0, float(confidence)))
        eid = f"E{len(self.task['evidence']) + 1}"
        self.task["evidence"].append({"id": eid, "claim": claim, "source": source[:300], "quote": (quote or "")[:300], "confidence": round(conf, 2), "flagged": conf < 0.7, "branch": branch})
        self._dirty = True
        return eid

    def add_deliverable(self, name: str, label: str, kind: str, data: bytes) -> None:
        size = self.svc.files.save(self.user_id, self.task["id"], name, data)
        ds = [d for d in self.task["deliverables"] if d["name"] != name]
        ds.append({"id": new_id("dl"), "name": name, "label": label, "kind": kind, "size": size})
        self.task["deliverables"] = ds
        self._dirty = True

    # ---- progress ----------------------------------------------------------------------------
    def set_progress(self, node: dict, pct: int) -> None:
        node["progress"] = max(node["progress"], min(99, int(pct)))
        self._dirty = True

    def recompute(self) -> None:
        now = now_ms()
        for n in self.task["nodes"]:
            if n["status"] == "running":
                n["elapsed"] = now - (n.get("_runStart") or now)
                est = max(1, n["duration"])
                n["progress"] = max(n["progress"], min(95, int(100 * (1 - math.exp(-n["elapsed"] / est)))))
        nodes = self.task["nodes"]
        self.task["progress"] = round(sum(100 if n["status"] == "completed" else n["progress"] for n in nodes) / len(nodes))
        if self.task["startedAt"]:
            end = self.task["finishedAt"] or now
            self.task["metrics"]["durationMs"] = end - self.task["startedAt"]

    def start_ticker(self, every: float = 1.0) -> None:
        async def loop():
            while True:
                await asyncio.sleep(every)
                try:
                    await self.publish_task()
                    await self.save()
                except Exception:  # never let the ticker kill the run
                    pass

        self._ticker = asyncio.create_task(loop())

    def stop_ticker(self) -> None:
        if self._ticker:
            self._ticker.cancel()

    # ---- human in the loop ------------------------------------------------------------------------
    async def request_approval(self, node: dict) -> None:
        if node["id"] in self._approvals and not self._approvals[node["id"]].done():
            return
        fut = asyncio.get_running_loop().create_future()
        self._approvals[node["id"]] = fut
        node["status"] = "awaiting_approval"
        self.task["status"] = "awaiting_approval"
        self.log(node["agent"], "warn", f"Waiting for your approval: {node['approval']['title']}.")
        await self.publish_task()
        await self.save(force=True)
        await self.svc.notify(self.user_id, "approval", f"{self.task['title']} needs your approval", self.task["id"])
        ok = await fut
        self.task["status"] = "running"
        if not ok:
            self.log("supervisor", "warn", f"You rejected: {node['approval']['title']}. Task stopped.")
            raise TaskStopped("Rejected at approval checkpoint")
        node["approved"] = True
        self.log("supervisor", "success", f"You approved: {node['approval']['title']}.")

    def resolve_approval(self, node_id: str, ok: bool) -> bool:
        fut = self._approvals.get(node_id)
        if fut and not fut.done():
            fut.set_result(ok)
            return True
        return False
