"""Runs one task end to end with the offline mock LLM, no services and no network.
    python -m scripts.demo_offline "Research the top AI startups in India"
"""
import asyncio
import sys

from tests.conftest import Harness


async def main(prompt: str) -> None:
    h = Harness()
    try:
        task = await h.create(prompt)
        t = await h.run(task)
        print(f"{t['id']}  {t['status']}  {t['metrics']['tokens']:,} tokens  ${t['metrics']['cost']:.4f}  retries={t['metrics']['retries']}")
        for n in t["nodes"]:
            print(f"  {n['id']} {n['agent']:<10} {n['status']:<10} attempt={n['attempt']}  {n['label']}")
        print("deliverables:", ", ".join(d["name"] for d in t["deliverables"]))
        print("\n--- log ---")
        for l in t["logs"]:
            print(f"{l['level']:<7} {l['agent']:<10} {l['text']}")
        print("\n--- report.md (first 18 lines) ---")
        print("\n".join(h.svc.files.path("u1", t["id"], "report.md").read_text().splitlines()[:18]))
    finally:
        h.cleanup()


if __name__ == "__main__":
    asyncio.run(main(" ".join(sys.argv[1:]) or "Research the top AI startups in India and prepare a market report"))
