from __future__ import annotations

from .base import Agent, retry_note

SYS = (
    "You are the Planning agent. Given an objective, return JSON with: "
    '"research_a": {"label": str, "queries": [2-4 web search queries]}, '
    '"research_b": {"label": str, "queries": [2-4 web search queries]} (a different angle than research_a, so both can run in parallel), '
    '"analysis": {"focus": str, "dimensions": [3-6 comparison dimensions]}, "outline": [4-7 report section titles]. '
    "Queries must be concrete and self-contained. Respect the user's constraints and remembered preferences."
)


def _clean_branch(b, fallback_label, objective):
    b = b if isinstance(b, dict) else {}
    qs = [str(q).strip()[:160] for q in (b.get("queries") or []) if str(q).strip()][:4]
    if not qs:
        qs = [f"{objective} overview"]
    return {"label": str(b.get("label") or fallback_label)[:80], "queries": qs}


class Planner(Agent):
    id, name = "planner", "Planner"
    start_line = "Decomposing the goal into a dependency graph"

    async def run(self, ctx, node, *, attempt, last_error, feedback=None):
        st, t = ctx.state, ctx.task
        obj = st["interpret"]["objective"]
        mem = []
        if t["options"].get("useMemory", True):
            mem = await ctx.svc.memory.context_for(ctx.user_id, obj)
            if mem:
                ctx.log("planner", "info", f"Using {len(mem)} memories ({sum(1 for m in mem if m['pinned'])} pinned).")
        mem_txt = "\n".join(f"- {m['title']}: {m['text']}" for m in mem) or "none"
        prompt = f"Objective: {obj}\nConstraints: {st['interpret'].get('constraints')}\nAttached files: {[a['name'] for a in t['attachments']] or 'none'}\nRemembered about this user:\n{mem_txt}{retry_note(last_error)}"
        plan = await ctx.ask_json(node, "plan", SYS, prompt, {"objective": obj})
        if not isinstance(plan, dict):
            raise ValueError("plan is not an object")
        st["plan"] = {
            "research_a": _clean_branch(plan.get("research_a"), ctx.node("n3")["label"], obj),
            "research_b": _clean_branch(plan.get("research_b"), ctx.node("n4")["label"], obj),
            "analysis": plan.get("analysis") or {"focus": "compare entities", "dimensions": []},
            "outline": [str(x)[:80] for x in (plan.get("outline") or ["Executive summary", "Key findings", "Risks and gaps"])][:8],
        }
        st["memories_used"] = [m["id"] for m in mem]
        # the plan may rename research steps
        ctx.node("n3")["label"] = st["plan"]["research_a"]["label"]
        ctx.node("n4")["label"] = st["plan"]["research_b"]["label"]
        ctx.message("planner", "researcher", "handoff", "Two research branches ready to run in parallel.", {"a": st["plan"]["research_a"]["queries"], "b": st["plan"]["research_b"]["queries"]})

    def done_line(self, ctx, node):
        p = ctx.state["plan"]
        return f"Plan ready: 9 steps, 2 parallel research branches ({len(p['research_a']['queries'])} + {len(p['research_b']['queries'])} queries)."
