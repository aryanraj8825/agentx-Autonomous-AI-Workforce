from __future__ import annotations

import re

from .base import Agent

SYS = (
    "You are the QA Reviewer. Judge the report strictly against the evidence list. Return JSON "
    '{"verdict": "ok"|"revise", "score": 0-1, "issues": [str]}. Flag claims not supported by the cited evidence, '
    "overstated confidence, missing sections and internal contradictions. Do not nitpick style."
)
CITE = re.compile(r"\[(E\d+)\]")
NUMERIC = re.compile(r"\d[\d,.]*\s?(%|percent|x\b|million|billion|crore|lakh|k\b)|[$€£₹]\s?\d|\b\d{2,}\b")


def deterministic_checks(report: str, evidence: list[dict]) -> list[str]:
    """Cheap, model-free checks. They run before (and override) the model's opinion."""
    ids = {e["id"]: e for e in evidence}
    issues = []
    if len(report) < 300:
        issues.append("Report is too short to be useful.")
    if "executive summary" not in report.lower():
        issues.append("Missing an Executive summary section.")
    for c in sorted(set(CITE.findall(report)) - set(ids)):
        issues.append(f"Cites [{c}], which does not exist in the evidence list.")
    for line in report.splitlines():
        s = line.strip()
        if s.startswith("#") or not s:
            continue
        if NUMERIC.search(s) and not CITE.search(s):
            issues.append(f"Numeric claim without a citation: “{s[:110]}”")
    low = sorted({c for c in CITE.findall(report) if c in ids and ids[c]["confidence"] < 0.5})
    if low:
        issues.append(f"Relies on very low-confidence evidence: {', '.join(low)}. Hedge or remove.")
    return issues[:8]


class Reviewer(Agent):
    id, name = "reviewer", "Reviewer"
    start_line = "Verifying claims against evidence"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        from ..engine.node_exec import execute_node  # lazy: node_exec imports the agent registry

        st, t = ctx.state, ctx.task
        max_rev = ctx.svc.settings.max_revisions
        issues: list[str] = []
        score = 0.0
        for rnd in range(max_rev + 1):
            report = st["report_md"]
            det = deterministic_checks(report, t["evidence"])
            ev_txt = "\n".join(f"[{e['id']}] ({e['confidence']}) {e['claim']}" for e in t["evidence"])
            res = await ctx.ask_json(node, "review", SYS, f"Evidence:\n{ev_txt}\n\nReport:\n{report}", {"report": report})
            res = res if isinstance(res, dict) else {}
            model_issues = [str(i)[:200] for i in res.get("issues") or []][:6] if res.get("verdict") == "revise" else []
            issues = det + [i for i in model_issues if i not in det]
            score = float(res.get("score", 0.5))
            if det:
                score = min(score, 0.7)
            ctx.set_progress(node, 30 + 30 * rnd)
            if not issues:
                break
            if rnd == max_rev:
                break
            fb = "\n".join(f"- {i}" for i in issues)
            ctx.log("reviewer", "warn", f"{len(issues)} issue(s) found. Returning draft to Writer: {issues[0][:120]}")
            ctx.message("reviewer", "writer", "revision", issues[0], {"issues": issues, "round": rnd + 1})
            ctx.task["metrics"]["retries"] += 1
            await execute_node(ctx, "n7", feedback=fb)  # the Writer step runs again and shows as attempt N
        st["review"] = {"verdict": "ok" if not issues else "accepted_with_issues", "score": round(score, 2), "open_issues": issues, "rounds": rnd}

    def done_line(self, ctx, node):
        r = ctx.state["review"]
        return "All claims verified against evidence." if not r["open_issues"] else f"Accepted with {len(r['open_issues'])} open issue(s), listed under Known limitations."
