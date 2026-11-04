"""Gemini over REST (no SDK dependency). Retries 429/5xx with backoff."""
from __future__ import annotations

import asyncio
import logging
import random

import httpx

from .base import LLMError, LLMResult, parse_json

log = logging.getLogger("agentx.llm")


class GeminiLLM:
    def __init__(self, api_key: str, base_url: str, embed_model: str, embed_dim: int, client: httpx.AsyncClient | None = None):
        self.key, self.base = api_key, base_url.rstrip("/")
        self.embed_model, self.embed_dim = embed_model, embed_dim
        self.http = client or httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0))

    async def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base}/{path}"
        last = ""
        for attempt in range(4):
            try:
                r = await self.http.post(url, json=body, headers={"x-goog-api-key": self.key})
            except httpx.HTTPError as e:
                last = f"network error: {e}"
            else:
                if r.status_code == 200:
                    return r.json()
                last = f"HTTP {r.status_code}: {r.text[:200]}"
                if r.status_code not in (429, 500, 502, 503, 504):
                    raise LLMError(last)
                ra = r.headers.get("retry-after")
                if ra and ra.isdigit():
                    await asyncio.sleep(min(int(ra), 20))
                    continue
            await asyncio.sleep(min(2**attempt, 10) + random.random())
        raise LLMError(f"Gemini request failed after retries ({last})")

    async def generate(self, *, purpose, system, prompt, model, temperature=0.3, json_mode=False, context=None) -> LLMResult:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 8192},
        }
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        data = await self._post(f"models/{model}:generateContent", body)
        cands = data.get("candidates") or []
        if not cands:
            raise LLMError(f"no candidates (blocked? {data.get('promptFeedback')})")
        parts = (cands[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts)
        if not text:
            raise LLMError(f"empty response (finish: {cands[0].get('finishReason')})")
        u = data.get("usageMetadata") or {}
        res = LLMResult(text=text, tokens_in=u.get("promptTokenCount", 0), tokens_out=u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0), model=model)
        if json_mode:
            res.data = parse_json(text)
        return res

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        reqs = [
            {"model": f"models/{self.embed_model}", "content": {"parts": [{"text": t[:8000]}]}, "outputDimensionality": self.embed_dim}
            for t in texts
        ]
        out: list[list[float]] = []
        for i in range(0, len(reqs), 100):  # batch limit
            data = await self._post(f"models/{self.embed_model}:batchEmbedContents", {"requests": reqs[i : i + 100]})
            out += [e["values"] for e in data["embeddings"]]
        return out
