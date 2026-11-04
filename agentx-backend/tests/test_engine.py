import asyncio

from app.llm.mock import MockLLM
from tests.conftest import Harness


def run(coro):
    return asyncio.run(coro)


def test_full_run_completes_with_deliverables_and_evidence():
    async def go():
        h = Harness()
        try:
            t = await h.run(await h.create())
            assert t["status"] == "completed", t.get("error")
            assert all(n["status"] == "completed" for n in t["nodes"])
            assert t["progress"] == 100 and t["metrics"]["tokens"] > 0
            names = {d["name"] for d in t["deliverables"]}
            assert {"comparison.csv", "sources.json", "report.md", "report.pdf"} <= names
            assert h.svc.files.path("u1", t["id"], "report.pdf").read_bytes()[:5] == b"%PDF-"
            assert len(t["evidence"]) >= 4 and all(0 <= e["confidence"] <= 1 for e in t["evidence"])
            md = h.svc.files.path("u1", t["id"], "report.md").read_text()
            assert "## Sources" in md and "[E1]" in md
        finally:
            h.cleanup()
    run(go())


def test_research_branches_run_in_parallel():
    class Slow(MockLLM):  # real models take time; the instant mock would finish inside one millisecond
        async def generate(self, **kw):
            await asyncio.sleep(0.05)
            return await super().generate(**kw)

    async def go():
        h = Harness(llm=Slow(flaws=False))
        try:
            t = await h.run(await h.create())
            a, b = (next(n for n in t["nodes"] if n["id"] == i) for i in ("n3", "n4"))
            assert a["startedAt"] < b["finishedAt"] and b["startedAt"] < a["finishedAt"]  # intervals overlap
            # and n5 only started after both finished
            n5 = next(n for n in t["nodes"] if n["id"] == "n5")
            assert n5["startedAt"] >= max(a["finishedAt"], b["finishedAt"])
        finally:
            h.cleanup()
    run(go())


def test_reviewer_sends_uncited_number_back_to_writer():
    async def go():
        h = Harness(llm=MockLLM(flaws=True))
        try:
            t = await h.run(await h.create())
            writer = next(n for n in t["nodes"] if n["id"] == "n7")
            assert writer["attempt"] == 2, "writer should have been re-run once"
            assert any(m["type"] == "revision" and m["from"] == "reviewer" for m in t["messages"])
            assert t["state"]["review"]["verdict"] == "ok"
            assert "42%" not in h.svc.files.path("u1", t["id"], "report.md").read_text().split("## Sources")[0] or "[E" in "x"
        finally:
            h.cleanup()
    run(go())


def test_no_flaws_means_no_revision():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            t = await h.run(await h.create())
            assert next(n for n in t["nodes"] if n["id"] == "n7")["attempt"] == 1
            assert not any(m["type"] == "revision" for m in t["messages"])
        finally:
            h.cleanup()
    run(go())


def test_transient_failure_is_retried_then_succeeds():
    async def go():
        h = Harness(llm=MockLLM(flaws=False, fail_once={"extract"}))
        try:
            t = await h.run(await h.create(), timeout=40)
            assert t["status"] == "completed"
            assert t["metrics"]["retries"] >= 1
            assert any(n["attempt"] == 2 for n in t["nodes"] if n["agent"] == "researcher")
            assert any(l["level"] == "error" for l in t["logs"])
        finally:
            h.cleanup()
    run(go())


def test_persistent_failure_fails_task_and_cancels_rest():
    class Broken(MockLLM):
        async def generate(self, **kw):
            if kw["purpose"] == "analyze":
                from app.llm.base import LLMError
                raise LLMError("boom")
            return await super().generate(**kw)

    async def go():
        h = Harness(llm=Broken(flaws=False))
        try:
            t = await h.run(await h.create(), timeout=60)
            assert t["status"] == "failed" and "Analyst" in t["error"]
            st = {n["id"]: n["status"] for n in t["nodes"]}
            assert st["n5"] == "failed" and st["n6"] == "cancelled" and st["n9"] == "cancelled"
        finally:
            h.cleanup()
    run(go())


def test_approval_pauses_then_resumes():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            task = await h.create(autonomy="ask")
            assert task["nodes"][5]["approval"]
            await h.svc.orchestrator.start(task["id"])
            for _ in range(500):
                await asyncio.sleep(0.02)
                cur = await h.db.tasks.get(task["id"])
                if cur["status"] == "awaiting_approval":
                    break
            assert cur["status"] == "awaiting_approval"
            assert next(n for n in cur["nodes"] if n["id"] == "n6")["status"] == "awaiting_approval"
            from app.realtime.bus import CONTROL
            await h.bus.publish(CONTROL, {"action": "approve", "taskId": task["id"], "nodeId": "n6"})
            for _ in range(500):
                await asyncio.sleep(0.02)
                if task["id"] not in h.svc.orchestrator.runs:
                    break
            done = await h.db.tasks.get(task["id"])
            assert done["status"] == "completed"
            assert any(e["type"] == "notification" for e in h.events)
        finally:
            h.cleanup()
    run(go())


def test_rejecting_approval_stops_task():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            task = await h.create(autonomy="ask")
            await h.svc.orchestrator.start(task["id"])
            from app.realtime.bus import CONTROL
            for _ in range(500):
                await asyncio.sleep(0.02)
                if (await h.db.tasks.get(task["id"]))["status"] == "awaiting_approval":
                    break
            await h.bus.publish(CONTROL, {"action": "reject", "taskId": task["id"], "nodeId": "n6"})
            for _ in range(300):
                await asyncio.sleep(0.02)
                if task["id"] not in h.svc.orchestrator.runs:
                    break
            done = await h.db.tasks.get(task["id"])
            assert done["status"] == "cancelled" and not done["deliverables"]
        finally:
            h.cleanup()
    run(go())


def test_cancel_midway():
    class Slow(MockLLM):
        async def generate(self, **kw):
            await asyncio.sleep(0.3)
            return await super().generate(**kw)

    async def go():
        h = Harness(llm=Slow(flaws=False))
        try:
            task = await h.create()
            await h.svc.orchestrator.start(task["id"])
            await asyncio.sleep(0.5)
            from app.realtime.bus import CONTROL
            await h.bus.publish(CONTROL, {"action": "cancel", "taskId": task["id"]})
            for _ in range(200):
                await asyncio.sleep(0.02)
                if task["id"] not in h.svc.orchestrator.runs:
                    break
            done = await h.db.tasks.get(task["id"])
            assert done["status"] == "cancelled"
            assert not any(n["status"] in ("running", "pending") for n in done["nodes"])
        finally:
            h.cleanup()
    run(go())


def test_token_budget_fails_task():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            task = await h.create(tokenBudget=50)
            t = await h.run(task)
            assert t["status"] == "failed" and "budget" in t["error"].lower()
        finally:
            h.cleanup()
    run(go())


def test_memory_written_and_used_next_time():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            await h.svc.memory.add("u1", type="preference", title="Report style", text="Prefers short bullets", pinned=True)
            t1 = await h.run(await h.create())
            mems = await h.svc.memory.list("u1")
            assert any(m["type"] == "history" for m in mems)
            t2 = await h.run(await h.create())
            assert t2["state"]["memories_used"], "second run should recall memories"
        finally:
            h.cleanup()
    run(go())


def test_events_stream_contains_progress_logs_and_final_state():
    async def go():
        h = Harness(llm=MockLLM(flaws=False))
        try:
            t = await h.run(await h.create())
            types = {e["type"] for e in h.events}
            assert {"task.updated", "log.added", "message.added", "notification"} <= types
            last = [e for e in h.events if e["type"] == "task.updated"][-1]
            assert last["task"]["status"] == "completed" and "logs" not in last["task"] and "userId" not in last["task"]
        finally:
            h.cleanup()
    run(go())


def test_recover_marks_orphaned_tasks_failed():
    async def go():
        h = Harness()
        try:
            t = await h.create()
            await h.db.tasks.update(t["id"], {"status": "running"})
            assert await h.svc.orchestrator.recover() == 1
            assert (await h.db.tasks.get(t["id"]))["status"] == "failed"
        finally:
            h.cleanup()
    run(go())
