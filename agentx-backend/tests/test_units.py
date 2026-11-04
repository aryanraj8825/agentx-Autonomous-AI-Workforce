import asyncio
import time

import pytest

from app.agents.reviewer import deterministic_checks
from app.config import validate
from app.db.memory_db import MemoryDatabase
from app.memory.embeddings import HashEmbedder
from app.memory.service import MemoryService
from app.memory.vector import MemoryVectorStore
from app.security import Throttle, create_token, decode_token, hash_password, verify_password
from app.tools.files import _csv_safe, markdown_to_pdf
from app.tools.sandbox import UnsafeCode, run_python, static_check
from app.tools.ssrf import BlockedURL, check_url
from app.util import safe_name
from tests.conftest import make_settings


def run(c):
    return asyncio.run(c)


def test_password_hashing():
    h = hash_password("correct horse")
    assert verify_password("correct horse", h) and not verify_password("wrong", h) and h != hash_password("correct horse")
    assert not verify_password("x", "garbage")


def test_jwt_roundtrip_and_expiry():
    s = make_settings()
    assert decode_token(s, create_token(s, "u1")) == "u1"
    assert decode_token(s, "not.a.token") is None
    assert decode_token(make_settings(jwt_secret="y" * 40), create_token(s, "u1")) is None
    assert decode_token(make_settings(jwt_ttl_minutes=-1), create_token(make_settings(jwt_ttl_minutes=-1), "u1")) is None


def test_throttle():
    t = Throttle(3, 60)
    assert [t.allow("k") for _ in range(4)] == [True, True, True, False]
    assert t.allow("other")


def test_config_validation():
    assert validate(make_settings()) == []
    bad = validate(make_settings(env="production", jwt_secret="dev-only-change-me", llm_backend="mock"))
    assert len(bad) >= 2
    assert any("celery" in p.lower() for p in validate(make_settings(run_mode="celery")))


@pytest.mark.parametrize("url", ["http://127.0.0.1/", "http://localhost/", "http://10.0.0.5/x", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://example.com", "http://[::1]/", "https://example.com:6379/", "http://user:pw@8.8.8.8/"])
def test_ssrf_blocks(url):
    with pytest.raises(BlockedURL):
        run(check_url(url))


def test_ssrf_allows_public_ip_literal():
    assert run(check_url("https://8.8.8.8/")) == "https://8.8.8.8/"


def test_sandbox_runs_and_returns_json():
    r = run(run_python("import json\nd=json.load(open('input.json'))\nprint(json.dumps({'n': len(d['x'])}))", {"x": [1, 2, 3]}))
    assert r.ok and r.result == {"n": 3}


def test_sandbox_times_out():
    t0 = time.time()
    r = run(run_python("while True: pass", timeout=1.0))
    assert r.timed_out and not r.ok and time.time() - t0 < 6


def test_sandbox_memory_limit():
    r = run(run_python("x = bytearray(2*1024*1024*1024)\nprint(1)", mem_mb=128))
    assert not r.ok


def test_sandbox_env_is_empty():
    r = run(run_python("import os, json\nprint(json.dumps(sorted(os.environ)))"))
    assert set(r.result) <= {"PATH", "PYTHONHASHSEED", "LC_CTYPE"}  # LC_CTYPE is added by the interpreter itself


@pytest.mark.parametrize("code", ["import socket", "from subprocess import run", "open('/etc/passwd')", "eval('1')", "x=().__class__.__bases__"])
def test_static_check_rejects(code):
    with pytest.raises(UnsafeCode):
        static_check(code)


def test_static_check_accepts_plain_math():
    static_check("import json, statistics\nprint(statistics.mean([1,2,3]))")


def test_reviewer_deterministic_checks():
    ev = [{"id": "E1", "confidence": 0.9}, {"id": "E2", "confidence": 0.3}]
    good = "# T\n\n## Executive summary\n" + "Plain finding [E1]. " * 30
    assert deterministic_checks(good, ev) == []
    bad = good + "\n- Revenue grew 42% last year.\n- Cites [E9].\n- Leans on [E2]."
    msgs = " ".join(deterministic_checks(bad, ev))
    assert "42%" in msgs and "E9" in msgs and "low-confidence" in msgs


def test_safe_name_and_csv_injection():
    assert safe_name("../../etc/passwd") == "passwd" and safe_name("a b/c.txt") == "c.txt" and safe_name("") == "file"
    assert _csv_safe("=HYPERLINK(1)").startswith("'") and _csv_safe("ok") == "ok" and _csv_safe(5) == 5


def test_pdf_handles_markup_characters():
    assert markdown_to_pdf("# A & B\n- <x> **bold** [E1]\n\nplain", "t")[:5] == b"%PDF-"


def test_db_filters_sort_and_isolation():
    async def go():
        db = MemoryDatabase()
        for i in range(5):
            await db.tasks.insert({"id": f"t{i}", "userId": "a" if i % 2 else "b", "createdAt": i, "status": "running" if i < 2 else "done"})
        assert len(await db.tasks.find({"userId": "a"})) == 2
        assert [d["id"] for d in await db.tasks.find({}, sort=[("createdAt", -1)], limit=2)] == ["t4", "t3"]
        assert await db.tasks.count({"status": {"$in": ["running"]}}) == 2
        assert len(await db.tasks.find({"createdAt": {"$gte": 2, "$lt": 4}})) == 2
        assert await db.next_seq("task") == 1001 and await db.next_seq("task") == 1002
        d = await db.tasks.get("t0"); d["x"] = 1  # copies, not references
        assert "x" not in await db.tasks.get("t0")
    run(go())


def test_memory_semantic_search_isolated_per_user():
    async def go():
        db, vec = MemoryDatabase(), MemoryVectorStore()
        m = MemoryService(db, vec, HashEmbedder(256))
        await m.add("u1", type="research", title="Funding sources", text="Regulatory filings were the most reliable funding data", tags=["funding"])
        await m.add("u1", type="preference", title="Style", text="Short bullet points please", pinned=True)
        await m.add("u2", type="research", title="Funding secrets", text="funding funding funding of another user")
        hits = await m.search("u1", "where to find reliable funding data")
        assert hits and hits[0]["title"] == "Funding sources" and all(h["userId"] == "u1" for h in hits)
        ctx = await m.context_for("u1", "funding data")
        assert {x["title"] for x in ctx} == {"Style", "Funding sources"}
        assert (await db.memories.get(hits[0]["id"]))["uses"] == 1
        assert await m.delete("u2", hits[0]["id"]) is False  # not yours
        assert await m.delete("u1", hits[0]["id"]) is True and not await m.search("u1", "reliable funding data")
    run(go())


def test_document_indexing_scoped_to_task():
    async def go():
        m = MemoryService(MemoryDatabase(), MemoryVectorStore(), HashEmbedder(256))
        await m.index_document("u1", "t1", "notes.txt", "The quarterly churn rate was lower for annual contracts than monthly contracts. " * 5)
        assert (await m.search_documents("u1", "t1", "churn rate annual contracts"))[0]["name"] == "notes.txt"
        assert await m.search_documents("u1", "t2", "churn rate") == []
        assert await m.search_documents("u2", "t1", "churn rate") == []
    run(go())
