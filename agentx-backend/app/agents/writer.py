from __future__ import annotations

import json

from .base import Agent, retry_note

SYS = (
    "You are the Writer. Produce a professional Markdown report using ONLY the insights and evidence provided. "
    "Rules: start with '# <title>'; include '## Executive summary' first; follow the given outline; "
    "cite every factual or numeric statement with evidence ids in square brackets like [E3]; never cite an id that was not provided; "
    "never state a number that is not in the evidence; keep sentences short; do NOT write a Sources section (it is added automatically)."
)


class Writer(Agent):
    id, name = "writer", "Writer"
    start_line = "Composing the document"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        st, t = ctx.state, ctx.task
        a, plan = st["analysis"], st["plan"]
        ev = [{"id": e["id"], "claim": e["claim"], "confidence": e["confidence"]} for e in t["evidence"]]
        revision = node["attempt"] - 1
        prompt = (
            f"Title: {t['title']}\nObjective: {st['interpret']['objective']}\nAudience: {st['interpret'].get('audience')}\nOutline: {plan['outline']}\n"
            f"Insights: {json.dumps(a['insights'])}\nEvidence:\n" + "\n".join(f"[{e['id']}] ({e['confidence']}) {e['claim']}" for e in ev)
        )
        if feedback and st.get("report_md"):
            prompt += f"\n\nPrevious draft:\n{st['report_md']}\n\nReviewer feedback to fix (change only what is needed):\n{feedback}"
        prompt += retry_note(last_error)
        text = await ctx.ask_text(node, "write", SYS, prompt, {"title": t["title"], "evidence": ev, "insights": a["insights"], "revision": revision})
        if len(text) < 200 or "# " not in text:
            raise ValueError("draft too short or missing headings")
        st["report_md"] = text
        ctx.set_progress(node, 90)
        ctx.message("writer", "reviewer", "result", "Draft ready for review." if not revision else f"Revision {revision} ready for review.", {"chars": len(text)})

    def done_line(self, ctx, node):
        return f"Draft complete: {len(ctx.state['report_md'])} characters."
