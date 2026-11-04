"""In-memory database. Zero setup for development and tests; data is lost on restart."""
from __future__ import annotations

import copy
from typing import Any

from .base import COLLECTIONS, Collection, Database, matches


class MemoryCollection:
    def __init__(self) -> None:
        self._docs: dict[str, dict] = {}

    async def insert(self, doc: dict) -> dict:
        if doc["id"] in self._docs:
            raise KeyError(f"duplicate id {doc['id']}")
        self._docs[doc["id"]] = copy.deepcopy(doc)
        return doc

    async def get(self, id: str) -> dict | None:
        d = self._docs.get(id)
        return copy.deepcopy(d) if d is not None else None

    async def find(self, filter: dict | None = None, *, sort=None, limit: int = 0, skip: int = 0) -> list[dict]:
        rows = [d for d in self._docs.values() if matches(d, filter or {})]
        for key, direction in reversed(sort or []):
            rows.sort(key=lambda d, k=key: (d.get(k) is None, d.get(k)), reverse=direction < 0)
        rows = rows[skip:]
        if limit:
            rows = rows[:limit]
        return [copy.deepcopy(r) for r in rows]

    async def update(self, id: str, patch: dict) -> dict | None:
        d = self._docs.get(id)
        if d is None:
            return None
        d.update(copy.deepcopy(patch))
        return copy.deepcopy(d)

    async def replace(self, id: str, doc: dict) -> None:
        self._docs[id] = copy.deepcopy(doc)

    async def delete(self, id: str) -> bool:
        return self._docs.pop(id, None) is not None

    async def delete_many(self, filter: dict) -> int:
        ids = [i for i, d in self._docs.items() if matches(d, filter)]
        for i in ids:
            del self._docs[i]
        return len(ids)

    async def count(self, filter: dict | None = None) -> int:
        return sum(1 for d in self._docs.values() if matches(d, filter or {}))


class MemoryDatabase(Database):
    def __init__(self) -> None:
        for name in COLLECTIONS:
            setattr(self, name, MemoryCollection())
        self._seq: dict[str, int] = {}

    async def next_seq(self, name: str, start: int = 1000) -> int:
        self._seq[name] = self._seq.get(name, start) + 1
        return self._seq[name]

    async def ping(self) -> bool:
        return True
