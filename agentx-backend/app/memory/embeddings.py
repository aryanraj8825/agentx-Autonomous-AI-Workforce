"""Embedders. HashEmbedder is a deterministic bag-of-words projection: real lexical similarity, no network."""
from __future__ import annotations

import hashlib
import math
import re

_TOK = re.compile(r"[a-z0-9]{3,}")


class HashEmbedder:
    def __init__(self, dim: int = 256):
        self.dim = dim

    def _one(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for tok in _TOK.findall(text.lower()):
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            v[h % self.dim] += 1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]
