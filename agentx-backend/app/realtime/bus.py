"""Event bus used for (1) server → browser events and (2) browser → engine control messages
(approve / reject / cancel). LocalBus works in one process; RedisBus lets API and Celery workers talk."""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Awaitable, Callable

log = logging.getLogger("agentx.bus")
Handler = Callable[[dict], Awaitable[None]]

EVENTS = "agentx.events"
CONTROL = "agentx.control"


class LocalBus:
    def __init__(self) -> None:
        self._subs: dict[str, list[Handler]] = defaultdict(list)

    async def start(self) -> None: ...

    async def close(self) -> None: ...

    def subscribe(self, channel: str, handler: Handler) -> None:
        self._subs[channel].append(handler)

    async def publish(self, channel: str, event: dict) -> None:
        for h in list(self._subs[channel]):
            try:
                await h(event)
            except Exception:  # one bad subscriber must not break others
                log.exception("bus handler failed on %s", channel)


class RedisBus(LocalBus):
    def __init__(self, url: str) -> None:
        super().__init__()
        import redis.asyncio as redis

        self.r = redis.from_url(url, decode_responses=True)
        self._task: asyncio.Task | None = None
        self._pubsub = None

    async def start(self) -> None:
        self._pubsub = self.r.pubsub()
        await self._pubsub.subscribe(EVENTS, CONTROL)
        self._task = asyncio.create_task(self._listen(), name="redis-bus")

    async def _listen(self) -> None:
        assert self._pubsub is not None
        async for m in self._pubsub.listen():
            if m["type"] != "message":
                continue
            try:
                event = json.loads(m["data"])
            except ValueError:
                continue
            for h in list(self._subs[m["channel"]]):
                try:
                    await h(event)
                except Exception:
                    log.exception("bus handler failed on %s", m["channel"])

    async def publish(self, channel: str, event: dict) -> None:
        await self.r.publish(channel, json.dumps(event, default=str))

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
        if self._pubsub:
            await self._pubsub.close()
        await self.r.aclose()


def make_bus(redis_url: str) -> LocalBus:
    return RedisBus(redis_url) if redis_url else LocalBus()
