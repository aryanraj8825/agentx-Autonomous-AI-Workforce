import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..security import decode_token

router = APIRouter()


@router.websocket("/ws")
async def ws(websocket: WebSocket):
    """Live events. Browsers cannot set headers on WebSockets, so the JWT is passed as ?token=.
    Events: task.updated, log.added, message.added, notification."""
    svc = websocket.app.state.services
    hub = websocket.app.state.hub
    origin = websocket.headers.get("origin")
    if origin and svc.settings.cors_origins and origin not in svc.settings.cors_origins:
        await websocket.close(code=4403)  # blocks cross-site WebSocket hijacking
        return
    uid = decode_token(svc.settings, websocket.query_params.get("token", ""))
    if not uid or not await svc.db.users.get(uid):
        await websocket.close(code=4401)
        return
    await websocket.accept()
    if not hub.add(uid, websocket):
        await websocket.close(code=4429)
        return
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=60)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                continue
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        hub.remove(uid, websocket)
