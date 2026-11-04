from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from ..agents.definitions import AGENT_DEFS
from ..deps import current_user, get_services

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def agent_rows(tasks: list[dict]) -> list[dict]:
    out = []
    for aid, d in AGENT_DEFS.items():
        nodes = [n for t in tasks for n in t["nodes"] if n["agent"] == aid and n["status"] != "pending"]
        done = [n for n in nodes if n["status"] == "completed"]
        out.append({
            "id": aid, "name": d["name"], "steps": len(nodes),
            "avgSeconds": round(sum(n["elapsed"] for n in done) / len(done) / 1000, 2) if done else 0,
            "firstTry": round(sum(1 for n in done if n["attempt"] == 1) / len(nodes), 3) if nodes else 0,
            "tokens": sum(n["tokens"] for n in done),
        })
    return out


@router.get("")
async def analytics(days: int = Query(14, ge=1, le=90), svc=Depends(get_services), user=Depends(current_user)):
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    since = int(start.timestamp() * 1000)
    tasks = await svc.db.tasks.find({"userId": user["id"], "createdAt": {"$gte": since}}, sort=[("createdAt", 1)])
    daily = {(start + timedelta(days=i)).strftime("%Y-%m-%d"): {"tasks": 0, "tokens": 0, "cost": 0.0} for i in range(days)}
    for t in tasks:
        k = datetime.fromtimestamp(t["createdAt"] / 1000, timezone.utc).strftime("%Y-%m-%d")
        if k in daily:
            d = daily[k]
            d["tasks"] += 1
            d["tokens"] += t["metrics"]["tokens"]
            d["cost"] = round(d["cost"] + t["metrics"]["cost"], 5)
    finished = [t for t in tasks if t["status"] in ("completed", "failed", "cancelled")]
    done = [t for t in finished if t["status"] == "completed"]
    return {
        "days": days,
        "daily": [{"day": k, **v} for k, v in daily.items()],
        "agents": agent_rows(tasks),
        "outcomes": {s: sum(1 for t in tasks if t["status"] == s) for s in ("completed", "failed", "cancelled")},
        "totals": {
            "tasks": len(tasks), "completionRate": round(len(done) / len(finished), 3) if finished else 0,
            "tokens": sum(t["metrics"]["tokens"] for t in tasks), "cost": round(sum(t["metrics"]["cost"] for t in tasks), 5),
            "avgDurationMs": int(sum(t["metrics"]["durationMs"] for t in finished) / len(finished)) if finished else 0,
            "retries": sum(t["metrics"]["retries"] for t in tasks),
        },
    }
