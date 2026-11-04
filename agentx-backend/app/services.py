"""Service container: constructed once at startup (API process) or per worker."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .integrations import IntegrationService
from .realtime.bus import EVENTS, LocalBus
from .tools.files import FileStore
from .tools.search import MockSearch, TavilySearch
from .util import new_id, now_ms

log = logging.getLogger("agentx.services")


@dataclass
class Services:
    settings: Settings
    db: Any
    bus: LocalBus
    llm: Any
    memory: Any
    vectors: Any
    files: FileStore
    integrations: IntegrationService
    http: Any = None  # httpx.AsyncClient
    search: Any = field(default_factory=MockSearch)
    orchestrator: Any = None
    _llm_cache: dict = field(default_factory=dict)

    async def notify(self, user_id: str, kind: str, text: str, task_id: str | None = None) -> None:
        n = {"id": new_id("nt"), "userId": user_id, "kind": kind, "text": text, "taskId": task_id, "ts": now_ms(), "read": False}
        await self.db.notifications.insert(n)
        await self.bus.publish(EVENTS, {"type": "notification", "userId": user_id, "notification": {k: v for k, v in n.items() if k != "userId"}})

    def search_for(self, user_id: str):
        return self.search

    async def llm_for(self, user_id: str):
        """Per-user Gemini key (if connected in Integrations) overrides the server key."""
        if self.settings.llm_backend != "gemini":
            return self.llm
        key = await self.integrations.secret(user_id, "gemini", "API key")
        if not key:
            return self.llm
        if key not in self._llm_cache:
            from .llm.gemini import GeminiLLM

            s = self.settings
            self._llm_cache[key] = GeminiLLM(key, s.gemini_base_url, s.embed_model, s.embed_dim, self.http)
        return self._llm_cache[key]

    async def agent_config(self, user_id: str) -> dict[str, dict]:
        from .agents.definitions import AGENT_DEFS, default_config

        saved = await self.db.agent_configs.get(user_id) or {}
        s = self.settings
        out = {}
        for a in AGENT_DEFS:
            out[a] = {**default_config(a, s.model_pro, s.model_flash), **(saved.get("agents", {}).get(a, {}))}
        return out

    async def policy(self, user_id: str) -> dict:
        d = await self.db.settings.get(user_id) or {}
        return {"externalApi": True, "fileWrite": True, "email": True, "codeExec": False, **(d.get("approval") or {})}
