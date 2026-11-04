"""Persistent AI memory: metadata in the database, vectors in Qdrant (or in memory)."""
from __future__ import annotations

from ..util import new_id, now_ms

TYPES = {"preference", "research", "history"}


def _text(m: dict) -> str:
    return f"{m['title']}. {m['text']} {' '.join(m.get('tags', []))}"


def chunk(text: str, size: int = 900, overlap: int = 120) -> list[str]:
    text = " ".join(text.split())
    out, i = [], 0
    while i < len(text):
        out.append(text[i : i + size])
        i += size - overlap
    return out


class MemoryService:
    def __init__(self, db, vectors, embedder):
        self.db, self.vectors, self.embedder = db, vectors, embedder

    async def add(self, user_id: str, *, type: str, title: str, text: str, tags: list[str] | None = None, pinned: bool = False) -> dict:
        if type not in TYPES:
            raise ValueError(f"type must be one of {sorted(TYPES)}")
        m = {"id": new_id("mem"), "userId": user_id, "type": type, "title": title.strip()[:120], "text": text.strip()[:2000], "tags": (tags or [])[:8], "pinned": pinned, "uses": 0, "createdAt": now_ms()}
        await self.db.memories.insert(m)
        [vec] = await self.embedder.embed([_text(m)])
        await self.vectors.upsert(m["id"], vec, {"userId": user_id, "kind": "memory", "type": type})
        return m

    async def list(self, user_id: str, type: str | None = None) -> list[dict]:
        f = {"userId": user_id, **({"type": type} if type else {})}
        rows = await self.db.memories.find(f, sort=[("createdAt", -1)])
        return sorted(rows, key=lambda m: not m["pinned"])

    async def pin(self, user_id: str, id: str) -> dict | None:
        m = await self.db.memories.get(id)
        if not m or m["userId"] != user_id:
            return None
        return await self.db.memories.update(id, {"pinned": not m["pinned"]})

    async def delete(self, user_id: str, id: str) -> bool:
        m = await self.db.memories.get(id)
        if not m or m["userId"] != user_id:
            return False
        await self.db.memories.delete(id)
        await self.vectors.delete(id)
        return True

    async def search(self, user_id: str, query: str, k: int = 5, min_score: float = 0.15) -> list[dict]:
        [vec] = await self.embedder.embed([query])
        hits = await self.vectors.search(vec, user_id=user_id, k=k, kind="memory")
        out = []
        for pid, score, _ in hits:
            if score < min_score:
                continue
            m = await self.db.memories.get(pid)
            if m:
                out.append({**m, "sim": round(score, 3)})
        return out

    async def context_for(self, user_id: str, query: str, k: int = 4) -> list[dict]:
        """Pinned memories plus the most relevant others; marks them as used."""
        pinned = [m for m in await self.db.memories.find({"userId": user_id, "pinned": True})]
        found = [m for m in await self.search(user_id, query, k) if not m["pinned"]]
        picked = pinned + found
        for m in picked:
            await self.db.memories.update(m["id"], {"uses": m["uses"] + 1})
        return picked

    # ---- uploaded documents (used by documents.retrieve) --------------------------------------
    async def index_document(self, user_id: str, task_id: str, name: str, text: str) -> int:
        chunks = chunk(text)[:200]
        if not chunks:
            return 0
        vecs = await self.embedder.embed(chunks)
        for i, (c, v) in enumerate(zip(chunks, vecs)):
            await self.vectors.upsert(f"doc:{task_id}:{name}:{i}", v, {"userId": user_id, "kind": "document", "taskId": task_id, "name": name, "text": c})
        return len(chunks)

    async def search_documents(self, user_id: str, task_id: str, query: str, k: int = 4) -> list[dict]:
        [vec] = await self.embedder.embed([query])
        hits = await self.vectors.search(vec, user_id=user_id, k=k, kind="document", extra={"taskId": task_id})
        return [{"name": p["name"], "text": p["text"], "score": round(s, 3)} for _, s, p in hits if s > 0.1]

    async def drop_task_documents(self, task_id: str) -> None:
        await self.vectors.delete_where(kind="document", taskId=task_id)
