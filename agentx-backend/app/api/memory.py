from fastapi import APIRouter, Depends, HTTPException

from ..deps import current_user, get_services
from ..schemas import MemoryIn, MemorySearchIn

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("")
async def list_memories(type: str | None = None, svc=Depends(get_services), user=Depends(current_user)):
    return [{k: v for k, v in m.items() if k != "userId"} for m in await svc.memory.list(user["id"], type)]


@router.post("", status_code=201)
async def add_memory(body: MemoryIn, svc=Depends(get_services), user=Depends(current_user)):
    m = await svc.memory.add(user["id"], **body.model_dump())
    return {k: v for k, v in m.items() if k != "userId"}


@router.post("/search")
async def search(body: MemorySearchIn, svc=Depends(get_services), user=Depends(current_user)):
    return [{k: v for k, v in m.items() if k != "userId"} for m in await svc.memory.search(user["id"], body.q, body.k)]


@router.patch("/{memory_id}/pin")
async def pin(memory_id: str, svc=Depends(get_services), user=Depends(current_user)):
    m = await svc.memory.pin(user["id"], memory_id)
    if not m:
        raise HTTPException(404, "Memory not found")
    return {k: v for k, v in m.items() if k != "userId"}


@router.delete("/{memory_id}")
async def delete(memory_id: str, svc=Depends(get_services), user=Depends(current_user)):
    if not await svc.memory.delete(user["id"], memory_id):
        raise HTTPException(404, "Memory not found")
    return {"deleted": 1}
