from __future__ import annotations

import asyncio

from ..tools.search import fetch_page
from ..tools.ssrf import BlockedURL
from .base import UNTRUSTED, Agent, retry_note
from ..engine.errors import ToolError

SYS = (
    "You are the Research agent. From the search results and documents provided, extract concrete, checkable facts that help the objective. "
    'Return JSON {"facts": [{"claim": str (one self-contained sentence), "source_url": str (must be one of the provided URLs or file names), '
    '"quote": str (short supporting excerpt), "confidence": number 0-1}]}. '
    "Confidence reflects source quality and how directly the excerpt supports the claim. Skip marketing fluff and anything unsupported. "
    + UNTRUSTED
)


class Researcher(Agent):
    id, name = "researcher", "Researcher"
    start_line = "Searching sources and extracting facts"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        branch = node["params"]["branch"]
        plan = ctx.state["plan"][branch]
        degraded = attempt > 1  # self-correction: fewer queries, snippets only
        queries = plan["queries"][: 2 if degraded else 4]
        obj = ctx.state["interpret"]["objective"]
        sem = asyncio.Semaphore(3)
        added: list[str] = []
        done = 0

        async def one(q: str):
            nonlocal done
            async with sem:
                hits = await ctx.svc.search_for(ctx.user_id).search(q, 3 if degraded else 5)
                snippets = [{"title": h.title, "url": h.url, "content": h.content[:700]} for h in hits]
                if not degraded and not any(h.mock for h in hits):
                    for h in hits[:2]:
                        try:
                            page = await fetch_page(ctx.svc.http, h.url, 4000)
                            for s in snippets:
                                if s["url"] == h.url:
                                    s["content"] = page
                        except (BlockedURL, Exception):  # a bad page must not fail the branch
                            continue
                for d in await ctx.svc.memory.search_documents(ctx.user_id, ctx.task["id"], q):
                    snippets.append({"title": d["name"], "url": f"upload:{d['name']}", "content": d["text"]})
                body = "\n".join(f"<source url=\"{s['url']}\" title=\"{s['title'][:120]}\">\n{s['content']}\n</source>" for s in snippets)
                res = await ctx.ask_json(node, "extract", SYS, f"Objective: {obj}\nSearch query: {q}\n\n{body}{retry_note(last_error)}", {"snippets": snippets, "query": q})
                allowed = {s["url"] for s in snippets}
                for f in (res or {}).get("facts", []) if isinstance(res, dict) else []:
                    url = str(f.get("source_url", ""))
                    if url not in allowed:  # drop sources the model invented
                        continue
                    eid = ctx.add_evidence(str(f.get("claim", "")), url, str(f.get("quote", "")), f.get("confidence", 0.5), branch)
                    if eid:
                        added.append(eid)
                done += 1
                ctx.set_progress(node, 100 * done // len(queries))

        await asyncio.gather(*(one(q) for q in queries))
        if not added:
            raise ToolError("no usable evidence found for this branch")
        ctx.state.setdefault("findings", {})[branch] = sorted(set(added))
        ctx.message("researcher", "analyst", "result", f"{len(set(added))} evidence items from {len(queries)} queries.", {"branch": branch, "evidence": sorted(set(added))})

    def done_line(self, ctx, node):
        n = len(ctx.state.get("findings", {}).get(node["params"]["branch"], []))
        return f"Collected {n} evidence items."
