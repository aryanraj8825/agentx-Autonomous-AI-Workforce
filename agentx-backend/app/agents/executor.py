from __future__ import annotations

import json

from ..tools.files import to_csv, to_xlsx
from .base import Agent


class Executor(Agent):
    id, name = "executor", "Executor"
    start_line = "Generating files"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        a = ctx.state["analysis"]
        cols, rows = a["comparison"]["columns"], a["comparison"]["rows"]
        formats = ctx.task["options"].get("formats", ["report", "csv"])
        ctx.add_deliverable("comparison.csv", "Comparison table", "csv", to_csv(cols, rows))
        ctx.set_progress(node, 40)
        ev_cols = ["id", "claim", "source", "confidence", "flagged"]
        ev_rows = [[e["id"], e["claim"], e["source"], e["confidence"], e["flagged"]] for e in ctx.task["evidence"]]
        ctx.add_deliverable("sources.json", "Evidence and sources", "json", json.dumps({"evidence": ctx.task["evidence"], "stats": a["stats"], "charts": a["charts"]}, indent=2).encode())
        if "xlsx" in formats:
            x = to_xlsx({"Comparison": (cols, rows), "Evidence": (ev_cols, ev_rows)})
            if x:
                ctx.add_deliverable("analysis.xlsx", "Spreadsheet", "xlsx", x)
            else:
                ctx.log("executor", "warn", "XLSX skipped: openpyxl is not installed.")
        if "plan" in formats:
            steps = "\n".join(f"{i + 1}. {n['label']} ({n['agent']})" for i, n in enumerate(ctx.task["nodes"]))
            ctx.add_deliverable("project-plan.md", "Project plan", "report", f"# Project plan\n\n{steps}\n".encode())
        if ctx.options.get("notifySlack"):
            hook = await ctx.svc.integrations.secret(ctx.user_id, "slack", "Webhook URL")
            if hook:
                r = await ctx.svc.http.post(hook, json={"text": f"AgentX finished: {ctx.task['title']} ({len(ev_rows)} evidence items)."}, timeout=10)
                ctx.log("executor", "success" if r.status_code < 300 else "warn", f"Slack notification: HTTP {r.status_code}")
            else:
                ctx.log("executor", "warn", "Slack is not connected; skipped notification.")

    def done_line(self, ctx, node):
        return f"Created {', '.join(d['name'] for d in ctx.task['deliverables'])}."
