from fastapi import APIRouter, Depends, HTTPException, Request

from ..deps import current_user, get_services, public_user
from ..schemas import LoginIn, RegisterIn
from ..security import Throttle, create_token, hash_password, verify_password
from ..util import new_id, now_ms

router = APIRouter(prefix="/api/auth", tags=["auth"])
_login_throttle = Throttle(limit=8, window_s=300)
_register_throttle = Throttle(limit=5, window_s=3600)
_DUMMY = hash_password("timing-equaliser")  # verify against this when the email is unknown, so timing doesn't reveal accounts


def _ip(request: Request) -> str:
    return request.client.host if request.client else "?"


@router.post("/register", status_code=201)
async def register(body: RegisterIn, request: Request, svc=Depends(get_services)):
    if not _register_throttle.allow(_ip(request)):
        raise HTTPException(429, "Too many sign-ups from this address. Try again later.")
    email = body.email.strip().lower()
    if await svc.db.users.find({"email": email}, limit=1):
        raise HTTPException(409, "An account with this email already exists")
    first = await svc.db.users.count() == 0
    user = {"id": new_id("usr"), "name": body.name.strip(), "email": email, "passwordHash": hash_password(body.password), "role": "admin" if first else "member", "createdAt": now_ms()}
    await svc.db.users.insert(user)
    return {"token": create_token(svc.settings, user["id"]), "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn, request: Request, svc=Depends(get_services)):
    email = body.email.strip().lower()
    key = f"{_ip(request)}|{email}"
    if not _login_throttle.allow(key):
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
    rows = await svc.db.users.find({"email": email}, limit=1)
    user = rows[0] if rows else None
    ok = verify_password(body.password, user["passwordHash"] if user else _DUMMY)
    if not user or not ok:
        raise HTTPException(401, "Incorrect email or password")
    _login_throttle.reset(key)
    return {"token": create_token(svc.settings, user["id"]), "user": public_user(user)}


@router.get("/me")
async def me(user=Depends(current_user)):
    return public_user(user)
