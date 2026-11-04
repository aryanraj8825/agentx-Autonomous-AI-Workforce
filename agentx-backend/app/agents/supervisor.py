from __future__ import annotations

import json

from ..tools.files import markdown_to_pdf
from .base import Agent, retry_note

SYS_INTERPRET = (
    "You are the Supervisor of an AI workforce. Read the user's goal and return JSON: "
    '{"objective": str (one clear sentence), "kind": "market"|"competitor"|"literature", "audience": str, '
    '"deliverables": [str], "constraints": [str]}. Do not invent requirements the user did not state.'
)


class Supervisor(Agent):
    id, name = "supervisor", "Supervisor"
    start_line = "Reading the objective and selecting agents"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        if node["params"].get("stage") == "assemble":
            return await self._assemble(ctx, node)
        t = ctx.task
        res = await ctx.ask_json(node, "interpret", SYS_INTERPRET, f"Goal:\n{t['prompt']}\n\nUser options: {json.dumps(t['options'])}{retry_note(last_error)}", {"prompt": t["prompt"]})
        if not isinstance(res, dict) or not res.get("objective"):
            raise ValueError("interpretation missing 'objective'")
        ctx.state["interpret"] = {"objective": str(res["objective"])[:300], "audience": res.get("audience"), "constraints": list(res.get("constraints") or [])[:6]}
        ctx.message("supervisor", "planner", "handoff", "Objective interpreted. Please plan the work.", ctx.state["interpret"])

    def done_line(self, ctx, node):
        if node["params"].get("stage") == "assemble":
            return "Deliverable bundle assembled."
        return "Objective understood. Activating planner, researchers, analyst, executor, writer and reviewer."

    async def _assemble(self, ctx, node):
        t, st = ctx.task, ctx.state
        report = st.get("report_md")
        if not report:
            raise ValueError("no approved report to assemble")
        sources = "\n".join(f"- [{e['id']}] {e['source']} (confidence {e['confidence']:.2f}{', low confidence' if e['flagged'] else ''})" for e in t["evidence"])
        limits = st.get("review", {}).get("open_issues") or []
        final = report.rstrip() + ("\n\n## Known limitations\n" + "\n".join(f"- {i}" for i in limits) if limits else "") + f"\n\n## Sources\n{sources}\n"
        formats = t["options"].get("formats", ["report"])
        ctx.add_deliverable("report.md", "Report (Markdown)", "report", final.encode())
        if "report" in formats:
            ctx.add_deliverable("report.pdf", "Report (PDF)", "pdf", markdown_to_pdf(final, t["title"]))
        ctx.set_progress(node, 80)
        st["summary"] = (st.get("interpret") or {}).get("objective", t["title"])
        t["summary"] = {"quality": st.get("review", {}).get("score"), "evidence": len(t["evidence"]), "flagged": sum(e["flagged"] for e in t["evidence"]), "deliverables": [d["name"] for d in t["deliverables"]]}
