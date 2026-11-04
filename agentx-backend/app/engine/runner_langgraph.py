"""LangGraph control flow: each workflow step is a graph node; fan-out / fan-in edges give parallelism
and joins. Step logic is shared with the native runner (execute_node), so behaviour is identical.

NOTE: written against langgraph >= 0.2 (StateGraph, add_edge with a list of sources for joins,
MemorySaver). It could not be executed in the sandbox this repo was authored in; run
`pytest tests/test_langgraph_runner.py` where langgraph is installed.
"""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from .node_exec import execute_node


class GState(TypedDict):
    done: Annotated[list[str], operator.add]


class LangGraphRunner:
    name = "langgraph"

    def __init__(self) -> None:
        from langgraph.checkpoint.memory import MemorySaver

        # Swap for langgraph-checkpoint-mongodb / postgres to checkpoint across restarts.
        self.checkpointer = MemorySaver()

    def build(self, ctx):
        from langgraph.graph import END, START, StateGraph

        g = StateGraph(GState)
        nodes = ctx.task["nodes"]

        def make(nid: str):
            async def step(state: GState) -> dict:
                await execute_node(ctx, nid)
                return {"done": [nid]}

            return step

        for n in nodes:
            g.add_node(n["id"], make(n["id"]))
        has_child = {d for n in nodes for d in n["deps"]}
        for n in nodes:
            if not n["deps"]:
                g.add_edge(START, n["id"])
            elif len(n["deps"]) == 1:
                g.add_edge(n["deps"][0], n["id"])
            else:
                g.add_edge(list(n["deps"]), n["id"])  # waits for every dependency
            if n["id"] not in has_child:
                g.add_edge(n["id"], END)
        return g.compile(checkpointer=self.checkpointer)

    async def run(self, ctx) -> None:
        graph = self.build(ctx)
        await graph.ainvoke({"done": []}, config={"configurable": {"thread_id": ctx.task["id"]}, "recursion_limit": 50})


def make_runner(preference: str):
    if preference in ("auto", "langgraph"):
        try:
            return LangGraphRunner()
        except ImportError:
            if preference == "langgraph":
                raise
    from .runner_native import NativeRunner

    return NativeRunner()
