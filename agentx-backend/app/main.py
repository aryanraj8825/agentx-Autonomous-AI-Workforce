"""AgentX API. Run: uvicorn app.main:app --reload"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import agents, analytics, auth, integrations, memory, misc, tasks, ws
from .bootstrap import build_services, close_services
from .config import get_settings
from .realtime.bus import EVENTS
from .realtime.hub import Hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("agentx")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    # In celery mode the engine lives in workers; the API only serves REST + WebSocket.
    svc = await build_services(s, with_orchestrator=s.run_mode == "inline")
    app.state.services = svc
    app.state.hub = Hub()
    svc.bus.subscribe(EVENTS, app.state.hub.dispatch)
    log.info("AgentX ready: db=%s vectors=%s llm=%s run_mode=%s", s.db_backend, s.vector_backend, s.llm_backend, s.run_mode)
    if s.llm_backend == "mock":
        log.warning("Using the MOCK LLM: outputs are placeholders. Set GEMINI_API_KEY for real results.")
    yield
    await close_services(svc)


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="AgentX API", version="1.0.0", lifespan=lifespan, docs_url=None if s.is_prod else "/docs", redoc_url=None, openapi_url=None if s.is_prod else "/openapi.json")
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=False, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"], max_age=600)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on our side. Try again."}, status_code=500)

    @app.get("/healthz", tags=["ops"])
    async def healthz():
        return {"ok": True}

    @app.get("/readyz", tags=["ops"])
    async def readyz(request: Request):
        svc = request.app.state.services
        try:
            await svc.db.ping()
            await svc.vectors.ping()
        except Exception:
            return JSONResponse({"ok": False}, status_code=503)
        return {"ok": True, "llm": s.llm_backend, "runner": svc.orchestrator.runner.name if svc.orchestrator else "worker"}

    for r in (auth.router, tasks.router, agents.router, memory.router, integrations.router, analytics.router, misc.router, ws.router):
        app.include_router(r)
    return app


app = create_app()
