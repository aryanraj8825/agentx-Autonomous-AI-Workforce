"""web.search and web.fetch tools. Tavily when a key is configured, otherwise clearly-labelled mock results."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from html import unescape
from urllib.parse import quote_plus, urljoin

from .ssrf import BlockedURL, check_url

MAX_BYTES = 1_500_000


@dataclass
class SearchHit:
    title: str
    url: str
    content: str
    score: float = 0.0
    mock: bool = False

    def as_dict(self) -> dict:
        return {"title": self.title, "url": self.url, "content": self.content, "score": self.score, "mock": self.mock}


class MockSearch:
    async def search(self, query: str, max_results: int = 5) -> list[SearchHit]:
        slug = re.sub(r"\W+", "-", query.lower()).strip("-")[:40]
        out = []
        for i in range(max_results):
            h = int(hashlib.sha256(f"{query}{i}".encode()).hexdigest()[:6], 16)
            out.append(SearchHit(f"Mock result {i + 1} for '{query}'", f"https://mock-source-{i + 1}.example.com/{slug}", f"Synthetic content about {query}. Not a real source.", round(0.9 - i * 0.1, 2), True))
        return out


class TavilySearch:
    def __init__(self, api_key: str, client):
        self.key, self.http = api_key, client

    async def search(self, query: str, max_results: int = 5) -> list[SearchHit]:
        r = await self.http.post("https://api.tavily.com/search", json={"query": query, "max_results": max_results, "search_depth": "basic"}, headers={"Authorization": f"Bearer {self.key}"})
        r.raise_for_status()
        return [SearchHit(x.get("title", ""), x["url"], x.get("content", ""), x.get("score", 0.0)) for x in r.json().get("results", [])]


_TAGS = re.compile(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", re.S | re.I)
_ANY = re.compile(r"<[^>]+>")


def html_to_text(html: str) -> str:
    t = _TAGS.sub(" ", html)
    t = _ANY.sub(" ", t)
    return re.sub(r"\s+", " ", unescape(t)).strip()


async def fetch_page(client, url: str, max_chars: int = 8000, hops: int = 3) -> str:
    """Fetch and flatten a page. Follows redirects manually so each hop passes the SSRF guard."""
    cur = url
    for _ in range(hops + 1):
        await check_url(cur)
        async with client.stream("GET", cur, follow_redirects=False, headers={"User-Agent": "AgentX-Researcher/1.0"}, timeout=15) as r:
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                cur = urljoin(cur, r.headers["location"])
                continue
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "text" not in ctype and "json" not in ctype and "xml" not in ctype:
                raise BlockedURL(f"unsupported content type: {ctype}")
            buf = b""
            async for chunk in r.aiter_bytes():
                buf += chunk
                if len(buf) > MAX_BYTES:
                    break
            text = buf.decode(r.encoding or "utf-8", errors="replace")
            return html_to_text(text)[:max_chars] if "html" in ctype else text[:max_chars]
    raise BlockedURL("too many redirects")
