import asyncio
import shutil
import tempfile

import pytest

from app.config import Settings
from app.db.memory_db import MemoryDatabase
from app.engine.orchestrator import Orchestrator
from app.engine.workflow import new_task
from app.integrations import IntegrationService
from app.llm.mock import MockLLM
from app.memory.embeddings import HashEmbedder
from app.memory.service import MemoryService
from app.memory.vector import MemoryVectorStore
from app.realtime.bus import LocalBus, EVENTS
from app.security import PlainBox
from app.services import Services
from app.tools.files import FileStore


def make_settings(**kw) -> Settings:
    base = dict(
        env="test", jwt_secret="x" * 40, jwt_ttl_minutes=60, secret_key="s", cors_origins=[], db_backend="memory", mongo_url="", mongo_db="t",
        vector_backend="memory", qdrant_url="", qdrant_api_key="", redis_url="", run_mode="inline", runner="native", llm_backend="mock",
        gemini_api_key="", gemini_base_url="", model_pro="pro", model_flash="flash", embed_model="e", embed_dim=256, tavily_api_key="",
        mock_llm_flaws=True, files_dir="", max_upload_mb=5, max_concurrent_tasks_per_user=3, node_timeout_s=30, max_revisions=2, enable_llm_code_exec=False,
    )
    base.update(kw)
    return Settings(**base)


class Harness:
    """Full engine stack on in-memory backends with a deterministic LLM."""

    def __init__(self, llm=None, **settings):
        self.tmp = tempfile.mkdtemp(prefix="agentx-test-")
        self.settings = make_settings(files_dir=self.tmp, **settings)
        self.db = MemoryDatabase()
        self.bus = LocalBus()
        self.events: list[dict] = []
        self.bus.subscribe(EVENTS, self._collect)
        emb = HashEmbedder(256)
        vec = MemoryVectorStore()
        self.llm = llm or MockLLM(flaws=True)
        self.svc = Services(settings=self.settings, db=self.db, bus=self.bus, llm=self.llm, memory=MemoryService(self.db, vec, emb), vectors=vec,
                            files=FileStore(self.tmp), integrations=IntegrationService(self.db, PlainBox(), self._health))
        self.svc.orchestrator = Orchestrator(self.svc)

    async def _collect(self, ev):
        self.events.append(ev)

    async def _health(self):
        return {}

    async def create(self, prompt="Research the top AI startups in India and prepare a market report", **options):
        opts = {"autonomy": "autonomous", **options}
        t = new_task(f"TSK-{await self.db.next_seq('task')}", "u1", {"prompt": prompt, "options": opts})
        await self.db.tasks.insert(t)
        return t

    async def run(self, task, timeout=30):
        await self.svc.orchestrator.start(task["id"])
        for _ in range(int(timeout / 0.02)):
            await asyncio.sleep(0.02)
            if task["id"] not in self.svc.orchestrator.runs:
                break
        return await self.db.tasks.get(task["id"])

    def cleanup(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


@pytest.fixture
def harness():
    h = Harness()
    yield h
    h.cleanup()
