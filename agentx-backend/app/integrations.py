"""Integration catalogue + per-user connections. Credentials are encrypted at rest and never returned."""
from __future__ import annotations

from .util import now_ms

CATALOG = {
    "gemini": {"name": "Gemini API", "group": "Models", "desc": "Reasoning and embeddings for every agent.", "scopes": ["generate", "embed"], "icon": "Sparkles", "fields": ["API key"], "system": True},
    "search": {"name": "Web search", "group": "Tools", "desc": "Tavily search used by the Researcher.", "scopes": ["search.read"], "icon": "Globe", "fields": ["API key"], "system": True},
    "mongodb": {"name": "MongoDB", "group": "Data", "desc": "Tasks, workflows, logs and usage metrics.", "scopes": ["read", "write"], "icon": "Database", "fields": [], "system": True},
    "qdrant": {"name": "Qdrant", "group": "Data", "desc": "Vector store for semantic memory.", "scopes": ["collections.read", "points.write"], "icon": "Boxes", "fields": [], "system": True},
    "redis": {"name": "Redis", "group": "Data", "desc": "Job queue and event fan-out.", "scopes": ["queue"], "icon": "Layers", "fields": [], "system": True},
    "slack": {"name": "Slack", "group": "Workspace", "desc": "Post run summaries (incoming webhook).", "scopes": ["chat.write"], "icon": "MessageSquare", "fields": ["Webhook URL"], "system": False},
    "github": {"name": "GitHub", "group": "Workspace", "desc": "Read repositories for code review tasks. Stored; agent tool not wired yet.", "scopes": ["repo.read"], "icon": "Github", "fields": ["Personal access token"], "system": False},
    "drive": {"name": "Google Drive", "group": "Workspace", "desc": "Save deliverables to a shared folder. Stored; agent tool not wired yet.", "scopes": ["files.create"], "icon": "HardDrive", "fields": ["OAuth"], "system": False},
    "smtp": {"name": "Email (SMTP)", "group": "Workspace", "desc": "Send reports to approved recipients. Stored; agent tool not wired yet.", "scopes": ["mail.send"], "icon": "Mail", "fields": ["Host", "Username", "Password"], "system": False},
}


class IntegrationService:
    def __init__(self, db, box, system_health):
        self.db, self.box, self.system_health = db, box, system_health  # system_health: async () -> dict[id, 'ok'|'degraded'|'off']

    async def list(self, user_id: str) -> list[dict]:
        mine = {d["key"]: d for d in await self.db.integrations.find({"userId": user_id})}
        sysh = await self.system_health()
        out = []
        for key, c in CATALOG.items():
            doc = mine.get(key)
            connected = bool(doc and doc["connected"]) or (c["system"] and sysh.get(key, "off") != "off")
            health = sysh.get(key, "off") if c["system"] else ("ok" if connected else "off")
            if doc and doc.get("overrideKey") and key in ("gemini", "search"):
                connected, health = True, "ok"
            out.append({"id": key, **{k: v for k, v in c.items() if k != "system"}, "managed": c["system"], "connected": connected, "health": health, "lastSync": (doc or {}).get("lastSync"), "fieldsSet": sorted((doc or {}).get("secrets", {}).keys())})
        return out

    async def connect(self, user_id: str, key: str, fields: dict[str, str]) -> dict:
        if key not in CATALOG:
            raise KeyError(key)
        c = CATALOG[key]
        if c["system"] and key not in ("gemini", "search"):
            raise ValueError(f"{c['name']} is managed by the server configuration")
        missing = [f for f in c["fields"] if not fields.get(f)]
        if missing and not (await self._doc(user_id, key)):
            raise ValueError(f"Missing: {', '.join(missing)}")
        doc = await self._doc(user_id, key) or {"id": f"{user_id}:{key}", "userId": user_id, "key": key, "secrets": {}}
        secrets = {**doc["secrets"], **{k: self.box.encrypt(v) for k, v in fields.items() if v}}
        doc.update(connected=True, secrets=secrets, lastSync=now_ms(), overrideKey=key in ("gemini", "search"))
        await self.db.integrations.replace(doc["id"], doc)
        return doc

    async def disconnect(self, user_id: str, key: str) -> None:
        await self.db.integrations.delete(f"{user_id}:{key}")

    async def _doc(self, user_id: str, key: str):
        return await self.db.integrations.get(f"{user_id}:{key}")

    async def secret(self, user_id: str, key: str, field: str) -> str | None:
        d = await self._doc(user_id, key)
        if not d or not d.get("connected"):
            return None
        enc = d["secrets"].get(field)
        return self.box.decrypt(enc) if enc else None
