from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Protocol


class LLMError(Exception):
    """Recoverable model failure (rate limit, bad JSON, timeout). The engine retries with a new strategy."""


@dataclass
class LLMResult:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = ""
    data: Any = None  # parsed JSON when requested

    @property
    def tokens(self) -> int:
        return self.tokens_in + self.tokens_out


class LLM(Protocol):
    async def generate(self, *, purpose: str, system: str, prompt: str, model: str, temperature: float = 0.3, json_mode: bool = False, context: dict | None = None) -> LLMResult: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I)


def parse_json(text: str) -> Any:
    """Parse model JSON, tolerating code fences and leading/trailing prose."""
    t = _FENCE.sub("", text.strip())
    try:
        return json.loads(t)
    except ValueError:
        pass
    start = min([i for i in (t.find("{"), t.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise LLMError("model returned no JSON")
    end = max(t.rfind("}"), t.rfind("]"))
    try:
        return json.loads(t[start : end + 1])
    except ValueError as e:
        raise LLMError(f"model returned invalid JSON: {e}") from e


# Approximate USD per 1M tokens (input, output). Verify against current pricing and override via PRICING_JSON.
PRICING = {
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-flash-lite": (0.10, 0.40),
}


def cost_usd(model: str, tokens_in: int, tokens_out: int) -> float:
    pin, pout = PRICING.get(model, (0.5, 2.0))
    return (tokens_in * pin + tokens_out * pout) / 1_000_000
