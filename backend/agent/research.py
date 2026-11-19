"""
agent/research.py
ResearchTool — DuckDuckGo search + page scraping + Gemini summarisation.
Results are cached in SQLite (ResearchCache) for 24 hours.
"""

import os
import json
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from dotenv import load_dotenv
from google import genai
from sqlalchemy import select

from models.database import AsyncSessionLocal, ResearchCache
from agent.knowledge import KnowledgeManager

load_dotenv()

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("GEMINI_API_KEY", "")
_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

if not _API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

_CACHE_TTL_HOURS = 24
_MAX_PAGE_CHARS = 8_000  # characters to keep from each page
_HTTP_TIMEOUT = 10  # seconds


@dataclass
class ResearchResult:
    summary: str
    sources: list[dict] = field(default_factory=list)  # {title, url, snippet}
    raw_results: list[dict] = field(default_factory=list)
    cached: bool = False


class ResearchTool:
    """
    Web-research tool that:
    1. Checks the SQLite cache first (24-hour TTL).
    2. Searches DuckDuckGo for top results.
    3. Fetches and strips page content with BeautifulSoup.
    4. Summarises with Gemini.
    5. Auto-stores findings into KnowledgeManager.
    6. Caches the result.
    """

    def __init__(self):
        self._km = KnowledgeManager()
        self._client = genai.Client(api_key=_API_KEY)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def search_and_summarize(
        self,
        query: str,
        max_results: int = 5,
        *,
        user_id: str,
    ) -> ResearchResult:
        """Perform research with user-specific caching."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        query_hash = self._hash(
            f"{user_id}:{max_results}:{query}"
        )

        # --- Cache lookup ---
        cached = await self._get_cache(query_hash)
        if cached:
            logger.info("Research cache hit for query: %s", query[:60])
            data = json.loads(cached.results_json)
            return ResearchResult(
                summary=data.get("summary", ""),
                sources=data.get("sources", []),
                raw_results=data.get("raw_results", []),
                cached=True,
            )

        # --- Live search ---
        raw_results = self._duck_search(query, max_results)
        sources = []
        page_texts = []

        for item in raw_results:
            url = item.get("href", item.get("url", ""))
            title = item.get("title", url)
            snippet = item.get("body", item.get("snippet", ""))

            page_text = await self._fetch_page(url)
            if page_text:
                page_texts.append(f"### {title}\nURL: {url}\n\n{page_text}")
                sources.append({"title": title, "url": url, "snippet": snippet})

        # --- Summarise ---
        summary = await self._summarize(query, page_texts) if page_texts else (
            "No usable page content could be retrieved for this query."
        )

        result = ResearchResult(
            summary=summary,
            sources=sources,
            raw_results=raw_results,
            cached=False,
        )

        # --- Persist cache ---
        await self._set_cache(
            query_hash=query_hash,
            query=query,
            result=result,
        )

        # --- Store in knowledge base ---
        if summary and summary != "No usable page content could be retrieved for this query.":
            try:
                await self._km.add_knowledge(
                    topic=f"Research: {query[:80]}",
                    content=summary,
                    source_url=sources[0]["url"] if sources else "",
                    confidence_score=0.85,
                    user_id=user_id,
                )
            except Exception as exc:
                logger.warning("Failed to store research in knowledge base: %s", exc)

        return result

    async def list_cache(self, limit: int = 50) -> list[dict]:
        """Return recently cached research queries."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ResearchCache)
                .order_by(ResearchCache.timestamp.desc())
                .limit(limit)
            )
            rows = result.scalars().all()

        return [
            {
                "id": r.id,
                "query": r.query,
                "timestamp": r.timestamp.isoformat(),
                "query_hash": r.query_hash,
            }
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _hash(query: str) -> str:
        return hashlib.sha256(query.strip().lower().encode()).hexdigest()

    def _duck_search(self, query: str, max_results: int) -> list[dict]:
        """Run DuckDuckGo text search and return raw result dicts."""
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            return results
        except Exception as exc:
            logger.error("DuckDuckGo search failed: %s", exc)
            return []

    async def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch a URL and extract meaningful paragraph text."""
        if not url:
            return None
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, follow_redirects=True) as client:
                response = await client.get(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0)"},
                )
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.text, "html.parser")

            # Remove boilerplate elements
            for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form"]):
                tag.decompose()

            paragraphs = soup.find_all("p")
            text = " ".join(p.get_text(separator=" ", strip=True) for p in paragraphs)
            # Fallback to full body text if no paragraphs found
            if len(text) < 200:
                text = soup.get_text(separator=" ", strip=True)

            # Collapse whitespace
            text = " ".join(text.split())
            return text[:_MAX_PAGE_CHARS]
        except Exception as exc:
            logger.debug("Page fetch failed for %s: %s", url, exc)
            return None

    async def _summarize(self, query: str, page_texts: list[str]) -> str:
        """Call Gemini to produce a concise research summary."""

        combined = "\n\n".join(page_texts[:5])

        prompt = (
            "You are a research assistant. Based on the web pages below, "
            "provide a comprehensive, accurate answer to this query:\n\n"
            f"Query: {query}\n\n"
            f"Web Content:\n{combined[:20_000]}\n\n"
            "Write a clear, well-structured summary (3-6 paragraphs). "
            "Include specific facts, figures, and actionable information."
        )

        try:
            response = await self._client.aio.models.generate_content(
                model=_MODEL_NAME,
                contents=prompt,
            )

            return response.text.strip() if response.text else (
                "Gemini returned an empty response."
            )

        except Exception:
            logger.exception("Gemini summarisation failed")
            return "Summary generation failed due to an API error."
    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    async def _get_cache(self, query_hash: str) -> Optional[ResearchCache]:
        cutoff = datetime.utcnow() - timedelta(hours=_CACHE_TTL_HOURS)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ResearchCache)
                .where(ResearchCache.query_hash == query_hash)
                .where(ResearchCache.timestamp >= cutoff)
            )
            return result.scalar_one_or_none()

    async def _set_cache(
        self, query_hash: str, query: str, result: ResearchResult
    ) -> None:
        payload = json.dumps(
            {
                "summary": result.summary,
                "sources": result.sources,
                "raw_results": result.raw_results,
            }
        )
        async with AsyncSessionLocal() as db:
            # Upsert: delete old then insert new
            from sqlalchemy import delete
            await db.execute(
                delete(ResearchCache).where(ResearchCache.query_hash == query_hash)
            )
            cache_entry = ResearchCache(
                query_hash=query_hash,
                query=query,
                results_json=payload,
            )
            db.add(cache_entry)
            await db.commit()
