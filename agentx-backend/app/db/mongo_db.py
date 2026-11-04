"""MongoDB (Motor) implementation. `id` is stored as `_id`."""
from __future__ import annotations

from .base import COLLECTIONS, Database


def _to_mongo(doc: dict) -> dict:
    d = dict(doc)
    d["_id"] = d.pop("id")
    return d


def _from_mongo(doc: dict | None) -> dict | None:
    if doc is None:
        return None
    d = dict(doc)
    d["id"] = d.pop("_id")
    return d


def _flt(f: dict | None) -> dict:
    f = dict(f or {})
    if "id" in f:
        f["_id"] = f.pop("id")
    return f


class MongoCollection:
    def __init__(self, coll) -> None:
        self.c = coll

    async def insert(self, doc: dict) -> dict:
        await self.c.insert_one(_to_mongo(doc))
        return doc

    async def get(self, id: str):
        return _from_mongo(await self.c.find_one({"_id": id}))

    async def find(self, filter=None, *, sort=None, limit: int = 0, skip: int = 0):
        cur = self.c.find(_flt(filter))
        if sort:
            cur = cur.sort([("_id" if k == "id" else k, d) for k, d in sort])
        if skip:
            cur = cur.skip(skip)
        if limit:
            cur = cur.limit(limit)
        return [_from_mongo(d) async for d in cur]

    async def update(self, id: str, patch: dict):
        patch = {k: v for k, v in patch.items() if k != "id"}
        return _from_mongo(await self.c.find_one_and_update({"_id": id}, {"$set": patch}, return_document=True))

    async def replace(self, id: str, doc: dict) -> None:
        await self.c.replace_one({"_id": id}, _to_mongo({**doc, "id": id}), upsert=True)

    async def delete(self, id: str) -> bool:
        return (await self.c.delete_one({"_id": id})).deleted_count > 0

    async def delete_many(self, filter: dict) -> int:
        return (await self.c.delete_many(_flt(filter))).deleted_count

    async def count(self, filter=None) -> int:
        return await self.c.count_documents(_flt(filter))


class MongoDatabase(Database):
    def __init__(self, url: str, db_name: str) -> None:
        from motor.motor_asyncio import AsyncIOMotorClient

        self.client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
        self.db = self.client[db_name]
        for name in COLLECTIONS:
            setattr(self, name, MongoCollection(self.db[name]))

    async def init(self) -> None:
        await self.db.users.create_index("email", unique=True)
        await self.db.tasks.create_index([("userId", 1), ("createdAt", -1)])
        await self.db.tasks.create_index([("userId", 1), ("status", 1)])
        await self.db.memories.create_index([("userId", 1), ("createdAt", -1)])
        await self.db.integrations.create_index("userId")
        await self.db.usage_metrics.create_index([("userId", 1), ("ts", -1)])
        await self.db.notifications.create_index([("userId", 1), ("ts", -1)])

    async def next_seq(self, name: str, start: int = 1000) -> int:
        # Seed once (idempotent, race-safe), then atomically increment.
        await self.db.counters.update_one({"_id": name}, {"$setOnInsert": {"n": start}}, upsert=True)
        doc = await self.db.counters.find_one_and_update({"_id": name}, {"$inc": {"n": 1}}, return_document=True)
        return int(doc["n"])

    async def ping(self) -> bool:
        await self.client.admin.command("ping")
        return True

    async def close(self) -> None:
        self.client.close()
