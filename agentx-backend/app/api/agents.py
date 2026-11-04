from fastapi import APIRouter, Depends, HTTPException

from ..agents.definitions import AGENT_DEFS
from ..deps import current_user, get_services
from ..schemas import AgentConfigIn
from .analytics import agent_rows

router = APIRouter(prefix="/api/agents", tags=["agents"])
MODELS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"]


@router.get("")
async def list_agents(svc=Depends(get_services), user=Depends(current_user)):
    cfg = await svc.agent_config(user["id"])
    tasks = await svc.db.tasks.find({"userId": user["id"]}, sort=[("createdAt", -1)], limit=200)
    stats = {r["id"]: r for r in agent_rows(tasks)}
    working = {n["agent"]: {"taskId": t["id"], "step": n["label"]} for t in tasks if t["status"] in ("running", "awaiting_approval") for n in t["nodes"] if n["status"] in ("running", "awaiting_approval")}
    return {"models": MODELS, "agents": [{"id": k, **{x: y for x, y in d.items() if x not in ("model",)}, "config": cfg[k], "stats": stats.get(k), "current": working.get(k)} for k, d in AGENT_DEFS.items()]}


@router.patch("/{agent_id}/config")
async def configure(agent_id: str, body: AgentConfigIn, svc=Depends(get_services), user=Depends(current_user)):
    if agent_id not in AGENT_DEFS:
        raise HTTPException(404, "Unknown agent")
    patch = body.model_dump(exclude_none=True)
    if "model" in patch and patch["model"] not in MODELS:
        raise HTTPException(422, f"Model must be one of {', '.join(MODELS)}")
    doc = await svc.db.agent_configs.get(user["id"]) or {"id": user["id"], "agents": {}}
    doc["agents"][agent_id] = {**doc["agents"].get(agent_id, {}), **patch}
    await svc.db.agent_configs.replace(user["id"], doc)
    return (await svc.agent_config(user["id"]))[agent_id]
