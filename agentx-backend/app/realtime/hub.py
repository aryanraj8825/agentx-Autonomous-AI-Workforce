"""WebSocket fan-out: delivers bus events to the sockets of the user they belong to."""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

log = logging.getLogger("agentx.ws")


class Hub:
    def __init__(self, max_per_user: int = 8) -> None:
        self.sockets: dict[str, set] = defaultdict(set)
        self.max_per_user = max_per_user

    def add(self, user_id: str, ws) -> bool:
        if len(self.sockets[user_id]) >= self.max_per_user:
            return False
        self.sockets[user_id].add(ws)
        return True

    def remove(self, user_id: str, ws) -> None:
        self.sockets[user_id].discard(ws)
        if not self.sockets[user_id]:
            self.sockets.pop(user_id, None)

    async def dispatch(self, event: dict) -> None:
        uid = event.get("userId")
        payload = {k: v for k, v in event.items() if k != "userId"}
        for ws in list(self.sockets.get(uid, ())):
            try:
                await asyncio.wait_for(ws.send_json(payload), timeout=5)  # a stuck client must not stall the run
            except Exception:
                self.remove(uid, ws)
                log.info("dropped slow or closed websocket for %s", uid)
