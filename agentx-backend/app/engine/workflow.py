"""Workflow templates (the DAG shape the frontend draws) and task creation."""
from __future__ import annotations

import re

from ..util import now_ms

LABELS = {
    "market": ["Collect entity profiles", "Collect funding and product data", "Compare models and positioning", "Draft market report"],
    "competitor": ["Identify competitors and plans", "Collect pricing and feature data", "Compare strengths and weaknesses", "Draft competitor report"],
    "literature": ["Find recent papers", "Extract methods and results", "Compare approaches", "Draft literature review"],
}


def classify_prompt(prompt: str = "") -> str:
    p = prompt.lower()
    if re.search(r"competitor|pricing|versus|\bvs\b", p):
        return "competitor"
    if re.search(r"paper|literature|study|studies|research papers|survey", p):
        return "literature"
    return "market"


def _node(id, agent, label, deps, duration, **extra):
    return {
        "id": id, "agent": agent, "label": label, "deps": deps, "duration": duration, "tokens": 0,
        "status": "pending", "progress": 0, "elapsed": 0, "attempt": 1, "startedAt": None, "finishedAt": None,
        "approval": None, "approved": False, "retryIn": None, "params": {}, **extra,
    }


def build_workflow(kind: str = "market", options: dict | None = None, policy: dict | None = None) -> list[dict]:
    """Nine-step DAG: n3/n4 run in parallel; reviewer may send work back to the writer."""
    options = options or {}
    L = LABELS.get(kind, LABELS["market"])
    ask = options.get("autonomy", "ask") != "autonomous" and (policy or {}).get("fileWrite", True)
    detail = "The Executor will create data files (CSV, JSON, XLSX) and save them to your workspace storage."
    if options.get("notifySlack"):
        detail += " It will also post a short summary to your connected Slack channel."
    return [
        _node("n1", "supervisor", "Interpret objective", [], 2200, params={"stage": "interpret"}),
        _node("n2", "planner", "Break goal into subtasks", ["n1"], 3000),
        _node("n3", "researcher", L[0], ["n2"], 5200, params={"branch": "research_a"}),
        _node("n4", "researcher", L[1], ["n2"], 6000, params={"branch": "research_b"}),
        _node("n5", "analyst", L[2], ["n3", "n4"], 5000),
        _node("n6", "executor", "Generate data files", ["n5"], 3600,
              approval={"title": "Write deliverables to your workspace", "detail": detail, "risk": "low"} if ask else None),
        _node("n7", "writer", L[3], ["n5"], 5600),
        _node("n8", "reviewer", "Check facts and citations", ["n6", "n7"], 3600),
        _node("n9", "supervisor", "Assemble final deliverable", ["n8"], 2000, params={"stage": "assemble"}),
    ]


def new_task(task_id: str, user_id: str, payload: dict, policy: dict | None = None) -> dict:
    prompt = payload["prompt"].strip()
    options = {"formats": ["report", "csv"], "autonomy": "ask", "useMemory": True, "tokenBudget": 60000, **(payload.get("options") or {})}
    kind = payload.get("kind") or classify_prompt(prompt)
    now = now_ms()
    return {
        "id": task_id, "userId": user_id, "title": (payload.get("title") or prompt)[:64], "prompt": prompt, "kind": kind,
        "status": "queued", "createdAt": now, "startedAt": None, "finishedAt": None, "progress": 0,
        "options": options, "attachments": payload.get("attachments") or [],
        "nodes": build_workflow(kind, options, policy),
        "logs": [], "messages": [], "deliverables": [], "evidence": [],
        "metrics": {"tokens": 0, "cost": 0.0, "durationMs": 0, "retries": 0},
        "state": {}, "error": None,
    }


ACTIVE = ("queued", "running", "awaiting_approval")
FINISHED = ("completed", "failed", "cancelled")


def public_task(task: dict, *, full: bool = False) -> dict:
    """What the API sends. `state` (shared workflow state) is summarised; big lists only when full."""
    out = {k: v for k, v in task.items() if k not in ("userId", "state", "logs", "messages")}
    out["nodes"] = [{k: v for k, v in n.items() if not k.startswith("_")} for n in task["nodes"]]
    if full:
        out["logs"], out["messages"] = task["logs"], task["messages"]
        out["sharedState"] = shared_state_summary(task)
    return out


def shared_state_summary(task: dict) -> dict:
    s = task.get("state", {})
    return {
        "task_id": task["id"], "status": task["status"], "objective": (s.get("interpret") or {}).get("objective"),
        "steps": {n["id"]: {"agent": n["agent"], "status": n["status"], "attempt": n["attempt"], "depends_on": n["deps"]} for n in task["nodes"]},
        "plan": s.get("plan"), "tokens": task["metrics"]["tokens"], "evidence_count": len(task["evidence"]),
        "review": s.get("review"),
    }


def reset_task(task: dict, policy: dict | None = None) -> dict:
    """Fresh run of the same task (Retry / Run again). Keeps id, prompt, options and attachments."""
    fresh = new_task(task["id"], task["userId"], {"prompt": task["prompt"], "title": task["title"], "kind": task["kind"], "options": task["options"], "attachments": task["attachments"]}, policy)
    fresh["createdAt"] = now_ms()
    return fresh
