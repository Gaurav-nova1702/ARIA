"""
api/research.py
FastAPI router for /api/research.
"""

import logging

from fastapi import APIRouter,Depends, HTTPException, Query
from pydantic import BaseModel, Field

from agent.research import ResearchTool
from utils.auth import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter()

_rt = ResearchTool()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ResearchRequest(BaseModel):
    query: str = Field(..., min_length=3, description="The topic or question to research")
    max_results: int = Field(5, ge=1, le=10, description="Max web results to fetch")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/search", summary="Perform web research and summarise findings")
async def research_search(request: ResearchRequest,user_id: str = Depends(get_current_user_id)):
    """
    Search the web via DuckDuckGo, fetch and parse pages, and return a
    Gemini-generated summary with source citations.
    Results are cached for 24 hours.
    """
    try:
        result = await _rt.search_and_summarize(
            query=request.query,
            max_results=request.max_results,
            user_id=user_id,
        )
        return {
            "query": request.query,
            "summary": result.summary,
            "sources": result.sources,
            "cached": result.cached,
            "source_count": len(result.sources),
        }
    except Exception as exc:
        logger.exception("Research search failed")
        raise HTTPException(status_code=500, detail=str(exc))



@router.get("/cache", summary="List cached research queries")
async def list_cache(
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
):
    """
    Temporarily disable cache listing until research
    history is separated by authenticated user.
    """
    raise HTTPException(
        status_code=503,
        detail=(
            "Research cache listing is temporarily unavailable "
            "during multi-user migration"
        ),
    )

