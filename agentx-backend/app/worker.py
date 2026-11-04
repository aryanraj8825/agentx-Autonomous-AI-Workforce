"""Celery worker (RUN_MODE=celery). Start: celery -A app.worker.celery_app worker -l info --concurrency 2

Each worker process keeps one event loop and one service container for its lifetime. Events and
approve/reject/cancel messages travel over the Redis bus, so the API process never touches the run."""
from __future__ import annotations

import asyncio

from celery import Celery

from .config import get_settings

s = get_settings()
celery_app = Celery("agentx", broker=s.redis_url or "memory://", backend=s.redis_url or None)
celery_app.conf.update(task_acks_late=True, worker_prefetch_multiplier=1, task_track_started=True, task_time_limit=3600)

_loop: asyncio.AbstractEventLoop | None = None
_svc = None


def _ensure():
    global _loop, _svc
    if _loop is None:
        from .bootstrap import build_services

        _loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_loop)
        _svc = _loop.run_until_complete(build_services(s))
    return _loop, _svc


@celery_app.task(name="agentx.run_task")
def run_task(task_id: str) -> str:
    loop, svc = _ensure()

    async def go():
        await svc.orchestrator.start(task_id)
        while task_id in svc.orchestrator.runs:
            await asyncio.sleep(0.25)

    loop.run_until_complete(go())
    return task_id
