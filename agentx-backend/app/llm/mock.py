"""Deterministic offline LLM for development and tests. No network, no API key.

It is a stand-in with plausible structure, not a source of facts: everything it produces is labelled
as mock output. `flaws` makes the first draft contain an uncited number so the Reviewer → Writer
revision loop is exercised; `fail_once` injects one failure per purpose to exercise retries.
"""
from __future__ import annotations

import hashlib
import re

from .base import LLMError, LLMResult
from ..memory.embeddings import HashEmbedder


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest(), 16)


class MockLLM:
    def __init__(self, flaws: bool = True, fail_once: set[str] | None = None, embed_dim: int = 256):
        self.flaws = flaws
        self.fail_once = set(fail_once or ())
        self._failed: set[str] = set()
        self.calls: list[str] = []
        self._emb = HashEmbedder(embed_dim)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await self._emb.embed(texts)

    async def generate(self, *, purpose, system, prompt, model, temperature=0.3, json_mode=False, context=None) -> LLMResult:
        self.calls.append(purpose)
        if purpose in self.fail_once and purpose not in self._failed:
            self._failed.add(purpose)
            raise LLMError(f"injected failure for {purpose}")
        ctx = context or {}
        fn = getattr(self, f"_{purpose}", None)
        if fn is None:
            raise LLMError(f"mock has no handler for purpose '{purpose}'")
        out = fn(ctx)
        text = out if isinstance(out, str) else __import__("json").dumps(out)
        tin, tout = max(1, len(prompt) // 4), max(1, len(text) // 4)
        return LLMResult(text=text, tokens_in=tin, tokens_out=tout, model=model, data=None if isinstance(out, str) else out)

    # ---- handlers -------------------------------------------------------------------------
    def _interpret(self, c):
        goal = c.get("prompt", "")
        kind = "literature" if re.search(r"paper|literature|study", goal, re.I) else "competitor" if re.search(r"competitor|pricing", goal, re.I) else "market"
        return {"objective": goal.strip()[:200], "kind": kind, "audience": "business reader", "deliverables": ["report", "csv"], "constraints": [], "note": "mock interpretation"}

    def _plan(self, c):
        g = c.get("objective", "the topic")
        return {
            "research_a": {"label": "Collect entity profiles", "queries": [f"{g} overview", f"{g} key players"]},
            "research_b": {"label": "Collect funding and pricing data", "queries": [f"{g} funding", f"{g} pricing models"]},
            "analysis": {"focus": "compare entities on model, scale and positioning", "dimensions": ["segment", "business model", "scale"]},
            "outline": ["Executive summary", "Key findings", "Comparison", "Risks and gaps"],
        }

    def _extract(self, c):
        facts = []
        for i, s in enumerate(c.get("snippets", [])[:4]):
            conf = 0.55 + (_h(s["url"]) % 40) / 100
            facts.append({"claim": f"[mock] {s['title']}", "source_url": s["url"], "quote": s.get("content", "")[:120], "confidence": round(min(conf, 0.95), 2)})
        return {"facts": facts}

    def _analyze(self, c):
        ev = c.get("evidence", [])
        ids = [e["id"] for e in ev]
        rows = [[e["id"], e["claim"][:60], e["source"].split("/")[2] if "//" in e["source"] else e["source"], e["confidence"]] for e in ev[:10]]
        return {
            "insights": [{"title": f"Insight {i + 1}", "detail": "[mock] pattern observed across sources", "evidence_ids": ids[i : i + 2]} for i in range(min(3, max(1, len(ids))))],
            "comparison": {"columns": ["evidence", "claim", "source", "confidence"], "rows": rows},
            "charts": [{"type": "bar", "title": "Confidence by evidence", "x": "evidence", "y": "confidence"}],
        }

    def _write(self, c):
        ids = [e["id"] for e in c.get("evidence", [])] or ["E1"]
        ins = c.get("insights", [])
        rev = c.get("revision", 0)
        body = [f"# {c.get('title', 'Report')}", "", "## Executive summary", f"This mock report summarises {len(ids)} pieces of evidence [{ids[0]}].", "", "## Key findings"]
        for i, x in enumerate(ins):
            cite = "".join(f"[{e}]" for e in x.get("evidence_ids", [])[:2] or ids[:1])
            body.append(f"- {x['title']}: {x['detail']} {cite}")
        if self.flaws and rev == 0:
            body.append("- Market share grew 42% year over year.")  # numeric claim with no citation → reviewer flags it
        body += ["", "## Risks and gaps", f"Public data is incomplete for several entities [{ids[-1]}]."]
        return "\n".join(body)

    def _review(self, c):
        return {"verdict": "ok", "score": 0.9, "issues": []}

    def _summarize(self, c):
        return {"summary": "[mock] Task completed with sourced findings.", "memories": []}
