from __future__ import annotations

import json

from ..engine.errors import ToolError
from ..tools.sandbox import STATS_SCRIPT, run_python
from .base import Agent, retry_note

SYS = (
    "You are the Data Analyst. Using ONLY the evidence provided, return JSON: "
    '{"insights": [{"title": str, "detail": str, "evidence_ids": [ids]}] (3-6, each must cite at least one evidence id), '
    '"comparison": {"columns": [str], "rows": [[...]]} (one row per entity or option compared; use null where the evidence is silent), '
    '"charts": [{"type": "bar"|"line"|"pie", "title": str, "x": str, "y": str}]}. '
    "Never invent numbers. If evidence is thin, say so in an insight."
)


class Analyst(Agent):
    id, name = "analyst", "Analyst"
    start_line = "Running comparison in the Python sandbox"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        ev = ctx.task["evidence"]
        if not ev:
            raise ToolError("no evidence to analyse")
        payload = [{"id": e["id"], "claim": e["claim"], "source": e["source"], "confidence": e["confidence"]} for e in ev]
        sb = await run_python(STATS_SCRIPT, {"evidence": payload}, timeout=10)
        if not sb.ok or not isinstance(sb.result, dict):
            raise ToolError(f"statistics sandbox failed: {sb.stderr[-200:] or 'timeout'}")
        ctx.set_progress(node, 30)
        plan = ctx.state["plan"]["analysis"]
        prompt = f"Objective: {ctx.state['interpret']['objective']}\nFocus: {plan.get('focus')}\nDimensions: {plan.get('dimensions')}\nStatistics: {json.dumps(sb.result)}\nEvidence:\n" + "\n".join(f"[{e['id']}] ({e['confidence']}) {e['claim']}" for e in payload) + retry_note(last_error)
        res = await ctx.ask_json(node, "analyze", SYS, prompt, {"evidence": payload})
        if not isinstance(res, dict):
            raise ValueError("analysis is not an object")
        valid = {e["id"] for e in ev}
        insights = []
        for i in res.get("insights") or []:
            ids = [x for x in i.get("evidence_ids", []) if x in valid]
            if ids:  # an insight without valid evidence is dropped, not trusted
                insights.append({"title": str(i.get("title", ""))[:120], "detail": str(i.get("detail", ""))[:500], "evidence_ids": ids})
        if not insights:
            raise ValueError("no insight cited valid evidence")
        cmp_ = res.get("comparison") or {}
        cols, rows = cmp_.get("columns") or ["evidence", "claim", "source", "confidence"], cmp_.get("rows") or [[e["id"], e["claim"], e["source"], e["confidence"]] for e in ev]
        ctx.state["analysis"] = {"stats": sb.result, "insights": insights, "comparison": {"columns": cols, "rows": rows}, "charts": (res.get("charts") or [])[:4]}
        ctx.message("analyst", "writer", "result", f"{len(insights)} insights and a {len(rows)}-row comparison.", {"insights": len(insights), "mean_confidence": sb.result.get("mean_confidence")})

    def done_line(self, ctx, node):
        a = ctx.state["analysis"]
        return f"Comparison built: {len(a['insights'])} insights, {len(a['comparison']['rows'])} rows; mean confidence {a['stats']['mean_confidence']}."
