"""Vector stores: in-memory cosine and Qdrant. Both scope every query by `userId`."""
from __future__ import annotations

import math
import uuid


class MemoryVectorStore:
    def __init__(self) -> None:
        self._pts: dict[str, tuple[list[float], dict]] = {}

    async def init(self, dim: int) -> None: ...

    async def upsert(self, id: str, vector: list[float], payload: dict) -> None:
        self._pts[id] = (vector, payload)

    async def search(self, vector: list[float], *, user_id: str, k: int = 5, kind: str | None = None, extra: dict | None = None) -> list[tuple[str, float, dict]]:
        out = []
        for pid, (v, p) in self._pts.items():
            if p.get("userId") != user_id or (kind and p.get("kind") != kind):
                continue
            if extra and any(p.get(a) != b for a, b in extra.items()):
                continue
            out.append((pid, _cos(vector, v), p))
        out.sort(key=lambda x: -x[1])
        return out[:k]

    async def delete(self, id: str) -> None:
        self._pts.pop(id, None)

    async def delete_where(self, **match) -> None:
        for pid in [i for i, (_, p) in self._pts.items() if all(p.get(k) == v for k, v in match.items())]:
            del self._pts[pid]

    async def ping(self) -> bool:
        return True

    async def close(self) -> None: ...


def _cos(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)


class QdrantVectorStore:
    COLLECTION = "agentx_memory"

    def __init__(self, url: str, api_key: str = "") -> None:
        from qdrant_client import AsyncQdrantClient

        self.c = AsyncQdrantClient(url=url, api_key=api_key or None)

    @staticmethod
    def _pid(id: str) -> str:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, id))  # Qdrant ids must be uuid or int

    async def init(self, dim: int) -> None:
        from qdrant_client import models as m

        if not await self.c.collection_exists(self.COLLECTION):
            await self.c.create_collection(self.COLLECTION, vectors_config=m.VectorParams(size=dim, distance=m.Distance.COSINE))
        for f in ("userId", "kind", "taskId"):
            try:
                await self.c.create_payload_index(self.COLLECTION, f, m.PayloadSchemaType.KEYWORD)
            except Exception:  # already exists
                pass

    async def upsert(self, id: str, vector: list[float], payload: dict) -> None:
        from qdrant_client import models as m

        await self.c.upsert(self.COLLECTION, points=[m.PointStruct(id=self._pid(id), vector=vector, payload={**payload, "ref": id})])

    async def search(self, vector, *, user_id: str, k: int = 5, kind: str | None = None, extra: dict | None = None):
        from qdrant_client import models as m

        must = [m.FieldCondition(key="userId", match=m.MatchValue(value=user_id))]
        if kind:
            must.append(m.FieldCondition(key="kind", match=m.MatchValue(value=kind)))
        for a, b in (extra or {}).items():
            must.append(m.FieldCondition(key=a, match=m.MatchValue(value=b)))
        res = await self.c.query_points(self.COLLECTION, query=vector, limit=k, query_filter=m.Filter(must=must), with_payload=True)
        return [(p.payload.get("ref", str(p.id)), float(p.score), p.payload) for p in res.points]

    async def delete(self, id: str) -> None:
        from qdrant_client import models as m

        await self.c.delete(self.COLLECTION, points_selector=m.PointIdsList(points=[self._pid(id)]))

    async def delete_where(self, **match) -> None:
        from qdrant_client import models as m

        flt = m.Filter(must=[m.FieldCondition(key=k, match=m.MatchValue(value=v)) for k, v in match.items()])
        await self.c.delete(self.COLLECTION, points_selector=m.FilterSelector(filter=flt))

    async def ping(self) -> bool:
        await self.c.get_collections()
        return True

    async def close(self) -> None:
        await self.c.close()
