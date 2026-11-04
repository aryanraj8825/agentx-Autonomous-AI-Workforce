"""Password hashing (stdlib scrypt), JWT tokens, login throttling, secret encryption."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
from collections import defaultdict, deque

import jwt  # PyJWT

from .config import Settings

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return "scrypt${}${}${}${}${}".format(_N, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, dk = stored.split("$")
        if scheme != "scrypt":
            return False
        calc = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:
        return False


def create_token(settings: Settings, user_id: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": user_id, "iat": now, "exp": now + settings.jwt_ttl_minutes * 60}, settings.jwt_secret, algorithm="HS256")


def decode_token(settings: Settings, token: str) -> str | None:
    """Returns the user id, or None if the token is invalid or expired."""
    try:
        data = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        return str(data["sub"])
    except jwt.PyJWTError:
        return None


class Throttle:
    """Sliding-window limiter, keyed by e.g. IP+email. In-process; use Redis for multi-instance."""

    def __init__(self, limit: int, window_s: int):
        self.limit, self.window = limit, window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self, key: str) -> None:
        self.hits.pop(key, None)


class SecretBox:
    """Encrypts integration credentials at rest (Fernet / AES-128-CBC + HMAC)."""

    def __init__(self, secret_key: str):
        from cryptography.fernet import Fernet  # imported lazily so tests run without it

        key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode()).digest())
        self._f = Fernet(key)

    def encrypt(self, value: str) -> str:
        return self._f.encrypt(value.encode()).decode()

    def decrypt(self, token: str) -> str:
        return self._f.decrypt(token.encode()).decode()


class PlainBox:
    """Test/dev fallback when `cryptography` is unavailable. Never used in production (see main.py)."""

    def encrypt(self, value: str) -> str:
        return "plain:" + value

    def decrypt(self, token: str) -> str:
        return token.removeprefix("plain:")


def make_secret_box(settings: Settings):
    try:
        return SecretBox(settings.secret_key)
    except ImportError:
        if settings.is_prod:
            raise RuntimeError("`cryptography` is required in production to encrypt credentials")
        return PlainBox()
