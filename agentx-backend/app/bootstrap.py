"""Builds the service container for the API process and for Celery workers."""
from __future__ import annotations

from .config import Settings
from .db.factory import make_database
from .integrations import CATALOG, IntegrationService
from .realtime.bus import make_bus
from .security import make_secret_box
from .services import Services
from .tools.files import FileStore
from .tools.search import MockSearch, TavilySearch


async def build_services(s: Settings, *, with_orchestrator: bool = True) -> Services:
    import httpx

    db = make_database(s)
    await db.init()
    bus = make_bus(s.redis_url)
    await bus.start()
    http = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), limits=httpx.Limits(max_connections=50))

    if s.llm_backend == "gemini":
        from .llm.gemini import GeminiLLM

        llm = GeminiLLM(s.gemini_api_key, s.gemini_base_url, s.embed_model, s.embed_dim, http)
    else:
        from .llm.mock import MockLLM

        llm = MockLLM(flaws=s.mock_llm_flaws, embed_dim=s.embed_dim)

    if s.vector_backend == "qdrant":
        from .memory.vector import QdrantVectorStore

        vectors = QdrantVectorStore(s.qdrant_url, s.qdrant_api_key)
    else:
        from .memory.vector import MemoryVectorStore

        vectors = MemoryVectorStore()
    await vectors.init(s.embed_dim)

    from .memory.service import MemoryService

    svc = Services(settings=s, db=db, bus=bus, llm=llm, memory=MemoryService(db, vectors, llm), vectors=vectors, files=FileStore(s.files_dir), http=http,
                   integrations=None, search=TavilySearch(s.tavily_api_key, http) if s.tavily_api_key else MockSearch())
    svc.integrations = IntegrationService(db, make_secret_box(s), lambda: system_health(svc))
    if with_orchestrator:
        from .engine.orchestrator import Orchestrator

        svc.orchestrator = Orchestrator(svc)
        if s.run_mode == "inline":  # with workers, other processes own the running tasks
            await svc.orchestrator.recover()
    return svc


async def system_health(svc: Services) -> dict[str, str]:
    """Health of server-managed integrations, shown on the Integrations page."""
    s = svc.settings
    out = {"gemini": "ok" if s.llm_backend == "gemini" else "off", "search": "ok" if s.tavily_api_key else "off", "mongodb": "off", "qdrant": "off", "redis": "off"}

    async def probe(key, enabled, fn):
        if not enabled:
            return
        try:
            await fn()
            out[key] = "ok"
        except Exception:
            out[key] = "degraded"

    await probe("mongodb", s.db_backend == "mongo", svc.db.ping)
    await probe("qdrant", s.vector_backend == "qdrant", svc.vectors.ping)
    await probe("redis", bool(s.redis_url), lambda: svc.bus.r.ping())
    return out


async def close_services(svc: Services) -> None:
    if svc.orchestrator:
        await svc.orchestrator.shutdown()
    await svc.bus.close()
    await svc.vectors.close()
    await svc.db.close()
    if svc.http:
        await svc.http.aclose()
