from fastapi import APIRouter, Depends, HTTPException

from ..deps import current_user, get_services
from ..schemas import ConnectIn

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("")
async def list_integrations(svc=Depends(get_services), user=Depends(current_user)):
    return await svc.integrations.list(user["id"])


@router.post("/{key}/connect")
async def connect(key: str, body: ConnectIn, svc=Depends(get_services), user=Depends(current_user)):
    try:
        await svc.integrations.connect(user["id"], key, body.fields)
    except KeyError:
        raise HTTPException(404, "Unknown integration")
    except ValueError as e:
        raise HTTPException(422, str(e))
    return next(i for i in await svc.integrations.list(user["id"]) if i["id"] == key)


@router.delete("/{key}")
async def disconnect(key: str, svc=Depends(get_services), user=Depends(current_user)):
    await svc.integrations.disconnect(user["id"], key)
    return {"ok": True}
