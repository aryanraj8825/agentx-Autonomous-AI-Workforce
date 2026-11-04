"""Storage abstraction. Documents are plain dicts with a string `id`.

Collections (mapping to the project spec): users, tasks (nodes = subtasks + workflow embedded),
memories, integrations, agent_configs, settings, usage_metrics, documents, notifications.
"""
from __future__ import annotations

from typing import Any, Protocol


class Collection(Protocol):
    async def insert(self, doc: dict) -> dict: ...
    async def get(self, id: str) -> dict | None: ...
    async def find(self, filter: dict | None = None, *, sort: list[tuple[str, int]] | None = None, limit: int = 0, skip: int = 0) -> list[dict]: ...
    async def update(self, id: str, patch: dict) -> dict | None: ...
    async def replace(self, id: str, doc: dict) -> None: ...
    async def delete(self, id: str) -> bool: ...
    async def delete_many(self, filter: dict) -> int: ...
    async def count(self, filter: dict | None = None) -> int: ...


COLLECTIONS = ["users", "tasks", "memories", "integrations", "agent_configs", "settings", "usage_metrics", "documents", "notifications"]


class Database:
    users: Collection
    tasks: Collection
    memories: Collection
    integrations: Collection
    agent_configs: Collection
    settings: Collection
    usage_metrics: Collection
    documents: Collection
    notifications: Collection

    async def next_seq(self, name: str, start: int = 1000) -> int:
        raise NotImplementedError

    async def ping(self) -> bool:
        raise NotImplementedError

    async def init(self) -> None:  # create indexes etc.
        return None

    async def close(self) -> None:
        return None


def matches(doc: dict, flt: dict[str, Any]) -> bool:
    """Tiny subset of Mongo query operators used by the app: equality, $in, $ne, $gte, $lt, $lte, $gt."""
    for key, cond in flt.items():
        val = doc.get(key)
        if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
            for op, arg in cond.items():
                if op == "$in" and val not in arg:
                    return False
                if op == "$ne" and val == arg:
                    return False
                if op == "$gte" and not (val is not None and val >= arg):
                    return False
                if op == "$gt" and not (val is not None and val > arg):
                    return False
                if op == "$lte" and not (val is not None and val <= arg):
                    return False
                if op == "$lt" and not (val is not None and val < arg):
                    return False
        elif val != cond:
            return False
    return True
