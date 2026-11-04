from fastapi import APIRouter, Depends, HTTPException

from ..deps import current_user, get_services
from ..schemas import SettingsIn

router = APIRouter(prefix="/api", tags=["misc"])
DEFAULTS = {"approval": {"externalApi": True, "fileWrite": True, "email": True, "codeExec": False}, "notifyDone": True, "notifyApproval": True, "density": "comfortable", "twoFactor": False}


@router.get("/settings")
async def get_settings(svc=Depends(get_services), user=Depends(current_user)):
    d = await svc.db.settings.get(user["id"]) or {}
    return {**DEFAULTS, **{k: v for k, v in d.items() if k != "id"}, "approval": {**DEFAULTS["approval"], **d.get("approval", {})}}


@router.put("/settings")
async def put_settings(body: SettingsIn, svc=Depends(get_services), user=Depends(current_user)):
    cur = await svc.db.settings.get(user["id"]) or {"id": user["id"]}
    patch = body.model_dump(exclude_none=True)
    if "approval" in patch:
        bad = set(patch["approval"]) - set(DEFAULTS["approval"])
        if bad:
            raise HTTPException(422, f"Unknown approval rules: {', '.join(sorted(bad))}")
        patch["approval"] = {**cur.get("approval", {}), **patch["approval"]}
    cur.update(patch)
    await svc.db.settings.replace(user["id"], cur)
    return await get_settings(svc, user)


@router.get("/notifications")
async def notifications(svc=Depends(get_services), user=Depends(current_user)):
    rows = await svc.db.notifications.find({"userId": user["id"]}, sort=[("ts", -1)], limit=40)
    return [{k: v for k, v in n.items() if k != "userId"} for n in rows]


@router.post("/notifications/read")
async def mark_read(svc=Depends(get_services), user=Depends(current_user)):
    for n in await svc.db.notifications.find({"userId": user["id"], "read": False}):
        await svc.db.notifications.update(n["id"], {"read": True})
    return {"ok": True}
