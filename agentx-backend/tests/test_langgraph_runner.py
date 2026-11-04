"""Runs the full engine through LangGraph. Skipped where langgraph is not installed."""
import asyncio

import pytest

pytest.importorskip("langgraph")

from app.llm.mock import MockLLM  # noqa: E402
from tests.conftest import Harness  # noqa: E402


def test_langgraph_runner_completes_and_matches_native():
    async def go():
        h = Harness(llm=MockLLM(flaws=True), runner="langgraph")
        try:
            assert h.svc.orchestrator.runner.name == "langgraph"
            t = await h.run(await h.create(), timeout=60)
            assert t["status"] == "completed", t.get("error")
            assert next(n for n in t["nodes"] if n["id"] == "n7")["attempt"] == 2
            assert {"report.pdf", "comparison.csv"} <= {d["name"] for d in t["deliverables"]}
        finally:
            h.cleanup()
    asyncio.run(go())
