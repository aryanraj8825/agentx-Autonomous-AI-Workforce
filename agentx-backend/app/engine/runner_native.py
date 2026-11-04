"""Dependency-aware async scheduler: starts every step whose dependencies are done (parallel),
cancels siblings on failure. Same semantics as the LangGraph runner; used when langgraph is absent."""
from __future__ import annotations

import asyncio

from .node_exec import execute_node


class NativeRunner:
    name = "native"

    async def run(self, ctx) -> None:
        nodes = {n["id"]: n for n in ctx.task["nodes"]}
        pending, running = set(nodes), {}
        try:
            while pending or running:
                for nid in sorted(pending):
                    if all(nodes[d]["status"] == "completed" for d in nodes[nid]["deps"]):
                        pending.discard(nid)
                        running[nid] = asyncio.create_task(execute_node(ctx, nid), name=f"node-{nid}")
                if not running:
                    break
                done, _ = await asyncio.wait(running.values(), return_when=asyncio.FIRST_COMPLETED)
                for t in done:
                    nid = next(k for k, v in running.items() if v is t)
                    del running[nid]
                    t.result()  # re-raise failure
        except BaseException:
            for t in running.values():
                t.cancel()
            await asyncio.gather(*running.values(), return_exceptions=True)
            raise
