from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from .security import decode_token


def get_services(request: Request):
    return request.app.state.services


async def current_user(request: Request, svc=Depends(get_services)) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token", headers={"WWW-Authenticate": "Bearer"})
    uid = decode_token(svc.settings, auth[7:].strip())
    user = await svc.db.users.get(uid) if uid else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


def public_user(u: dict) -> dict:
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u.get("role", "member")}
