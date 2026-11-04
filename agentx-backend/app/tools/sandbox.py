"""Run Python in a locked-down subprocess: no site-packages (-I), CPU/memory/file limits, wall-clock
timeout, empty environment, throwaway working dir, output cap.

This limits accidents and runaway code. It does NOT provide kernel-level network isolation or a
security boundary against hostile code: for untrusted code run the worker in a container with
`--network none` (see docker-compose `worker`) or gVisor/Firecracker.
"""
from __future__ import annotations

import ast
import asyncio
import json
import os
import signal
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

MAX_OUT = 1_000_000
FORBIDDEN_IMPORTS = {"socket", "subprocess", "ctypes", "multiprocessing", "shutil", "urllib", "http", "requests", "httpx", "ftplib", "smtplib", "importlib", "pty", "signal"}
FORBIDDEN_CALLS = {"eval", "exec", "compile", "open", "__import__", "input", "breakpoint"}


class UnsafeCode(Exception):
    pass


def static_check(code: str) -> None:
    """Defence in depth for model-written code. Not a guarantee."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise UnsafeCode(f"syntax error: {e}") from e
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            for a in n.names:
                if a.name.split(".")[0] in FORBIDDEN_IMPORTS:
                    raise UnsafeCode(f"import not allowed: {a.name}")
        elif isinstance(n, ast.ImportFrom) and (n.module or "").split(".")[0] in FORBIDDEN_IMPORTS:
            raise UnsafeCode(f"import not allowed: {n.module}")
        elif isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in FORBIDDEN_CALLS:
            raise UnsafeCode(f"call not allowed: {n.func.id}")
        elif isinstance(n, ast.Attribute) and n.attr.startswith("__") and n.attr.endswith("__") and n.attr not in {"__name__", "__len__", "__init__"}:
            raise UnsafeCode(f"dunder access not allowed: {n.attr}")


@dataclass
class SandboxResult:
    ok: bool
    stdout: str
    stderr: str
    returncode: int | None
    timed_out: bool
    result: object = None


def _limits(mem_mb: int, cpu_s: int):
    def apply():
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
        resource.setrlimit(resource.RLIMIT_AS, (mem_mb * 1024 * 1024, mem_mb * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    return apply


async def run_python(code: str, input_data: dict | None = None, *, timeout: float = 10.0, mem_mb: int = 256) -> SandboxResult:
    """The script reads `input.json` from its cwd and prints a final JSON line to stdout as its result."""
    with tempfile.TemporaryDirectory(prefix="agentx-sbx-") as d:
        Path(d, "main.py").write_text(code)
        Path(d, "input.json").write_text(json.dumps(input_data or {}))
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-I", "main.py",
            cwd=d, env={"PATH": "/usr/bin:/bin", "PYTHONHASHSEED": "0"},
            stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            preexec_fn=_limits(mem_mb, int(timeout) + 2) if os.name == "posix" else None,
            start_new_session=True,
        )
        timed_out = False
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            timed_out = True
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            out, err = await proc.communicate()
        except asyncio.CancelledError:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            raise
        so = out[:MAX_OUT].decode(errors="replace")
        se = err[:MAX_OUT].decode(errors="replace")
        result = None
        for line in reversed(so.strip().splitlines()):
            try:
                result = json.loads(line)
                break
            except ValueError:
                continue
        return SandboxResult(ok=proc.returncode == 0 and not timed_out, stdout=so, stderr=se, returncode=proc.returncode, timed_out=timed_out, result=result)


# Trusted script used by the Analyst (not model-written).
STATS_SCRIPT = r'''
import json, statistics, collections
d = json.load(open("input.json"))
ev = d["evidence"]
conf = [e["confidence"] for e in ev]
domains = collections.Counter(e["source"].split("/")[2] if "//" in e["source"] else e["source"] for e in ev)
out = {
  "evidence_count": len(ev),
  "unique_sources": len(domains),
  "mean_confidence": round(statistics.fmean(conf), 3) if conf else 0,
  "median_confidence": round(statistics.median(conf), 3) if conf else 0,
  "low_confidence": [e["id"] for e in ev if e["confidence"] < 0.7],
  "top_sources": domains.most_common(5),
}
print(json.dumps(out))
'''
