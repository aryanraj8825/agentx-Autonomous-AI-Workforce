"""Runs one workflow step with the retry / self-correction policy shared by both runners."""
from __future__ import annotations

import asyncio
import logging

from ..agents.registry import REGISTRY
from ..llm.base import LLMError
from ..util import new_id, now_ms
from .errors import BudgetExceeded, NodeFailed, TaskStopped, ToolError

log = logging.getLogger("agentx.engine")
RETRYABLE = (LLMError, ToolError, asyncio.TimeoutError, ValueError, KeyError, TypeError, OSError)


async def execute_node(ctx, node_id: str, *, feedback: str | None = None) -> None:
    node = ctx.node(node_id)
    agent = REGISTRY[node["agent"]]
    cfg = ctx.cfg(node["agent"])
    name = agent.name

    if not cfg.get("enabled", True):
        node["status"] = "failed"
        ctx.log(node["agent"], "error", f"{name} is disabled in Agent workspace. Enable it to run this step.")
        await ctx.publish_task()
        raise NodeFailed(f"{name} is disabled")

    rerun = node["startedAt"] is not None
    if rerun:
        node["attempt"] += 1
    node["startedAt"] = node["startedAt"] or now_ms()
    max_tries = cfg["maxRetries"] + 1
    base, tries, last_err = node["attempt"], 0, None

    while True:
        tries += 1
        node["attempt"] = base + tries - 1
        node.update(status="running", progress=0, elapsed=0, retryIn=None, _runStart=now_ms())
        ctx.log(node["agent"], "info", f"{agent.start_line} — {node['label']}.")
        up = next((ctx.node(d)["agent"] for d in node["deps"]), None)
        if up and not rerun and tries == 1:
            ctx.message(up, node["agent"], "handoff", f'Handing over results for "{node["label"]}".', {"node": node["id"], "deps": node["deps"]})
        await ctx.publish_task()

        try:
            if node.get("approval") and not node.get("approved"):
                await ctx.request_approval(node)
                node.update(status="running", _runStart=now_ms())
                await ctx.publish_task()
            await asyncio.wait_for(agent.run(ctx, node, attempt=tries, last_error=last_err, feedback=feedback), timeout=ctx.svc.settings.node_timeout_s)
        except (TaskStopped, BudgetExceeded, asyncio.CancelledError):
            raise
        except RETRYABLE as e:
            last_err = f"{type(e).__name__}: {e}"
            ctx.log(node["agent"], "error", f"{last_err}"[:300])
            await ctx.svc.db.usage_metrics.insert({"id": new_id("um"), "userId": ctx.user_id, "taskId": ctx.task["id"], "agent": node["agent"], "ok": False, "ts": now_ms(), "tokens": node["tokens"]})
            if tries >= max_tries:
                node["status"] = "failed"
                ctx.message(node["agent"], "supervisor", "error", f"Giving up on \"{node['label']}\" after {tries} attempts.")
                await ctx.publish_task()
                raise NodeFailed(f"{name} failed: {last_err}") from e
            backoff = min(1500 * tries, 8000)
            node.update(status="failed", retryIn=backoff, progress=max(node["progress"], 40))
            ctx.message(node["agent"], "supervisor", "error", f"{last_err[:160]}. Retrying with a different strategy.")
            ctx.task["metrics"]["retries"] += 1
            await ctx.publish_task()
            await asyncio.sleep(backoff / 1000)
            ctx.log(node["agent"], "info", f"Self-correction: retrying \"{node['label']}\" (attempt {tries + 1}).")
            continue

        node.update(status="completed", progress=100, finishedAt=now_ms(), retryIn=None)
        node["elapsed"] = node["finishedAt"] - node["_runStart"]
        ctx.log(node["agent"], "success", agent.done_line(ctx, node))
        down = next((n for n in ctx.task["nodes"] if node["id"] in n["deps"]), None)
        if down:
            ctx.message(node["agent"], down["agent"], "result", f'Completed "{node["label"]}".', {"node": node["id"], "tokens": node["tokens"]})
        await ctx.svc.db.usage_metrics.insert({"id": new_id("um"), "userId": ctx.user_id, "taskId": ctx.task["id"], "agent": node["agent"], "model": cfg["model"], "ok": True, "tokens": node["tokens"], "durationMs": node["elapsed"], "ts": now_ms()})
        await ctx.publish_task()
        await ctx.save()
        return
