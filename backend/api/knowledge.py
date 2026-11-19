
"""
api/knowledge.py
Authenticated Knowledge Base API for ARIA.
"""

import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    UploadFile,
    File,
)
from pydantic import BaseModel, Field

from agent.knowledge import KnowledgeManager
from utils.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter()
_km = KnowledgeManager()


# -----------------------------------------------------------
# Request schema
# -----------------------------------------------------------

class AddKnowledgeRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    content: str = Field(..., min_length=10)
    source_url: str = Field("")
    confidence_score: float = Field(1.0, ge=0.0, le=1.0)


# -----------------------------------------------------------
# List knowledge
# -----------------------------------------------------------

@router.get("/", summary="List user knowledge")
async def list_knowledge(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
):
    try:
        entries = await _km.get_all_knowledge(
            limit=limit,
            offset=offset,
            user_id=user_id,
        )

        return {
            "entries": entries,
            "count": len(entries),
            "limit": limit,
            "offset": offset,
        }

    except Exception:
        logger.exception("Failed to list knowledge")
        raise HTTPException(
            status_code=500,
            detail="Failed to list knowledge",
        )


# -----------------------------------------------------------
# Add knowledge
# -----------------------------------------------------------

@router.post("/", summary="Add user knowledge")
async def add_knowledge(
    request: AddKnowledgeRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        kid = await _km.add_knowledge(
            topic=request.topic,
            content=request.content,
            source_url=request.source_url,
            confidence_score=request.confidence_score,
            user_id=user_id,
        )

        if kid is None:
            return {
                "created": False,
                "id": None,
                "reason": "Near-duplicate entry detected; skipped.",
            }

        return {
            "created": True,
            "id": kid,
        }

    except Exception:
        logger.exception("Failed to add knowledge")
        raise HTTPException(
            status_code=500,
            detail="Failed to add knowledge",
        )


# -----------------------------------------------------------
# Semantic search
# -----------------------------------------------------------

@router.get("/search", summary="Search user knowledge")
async def search_knowledge(
    q: str | None = Query(None),
    query: str | None = Query(None),
    n: int = Query(5, ge=1, le=20),
    user_id: str = Depends(get_current_user_id),
):
    search_text = q or query

    if not search_text or not search_text.strip():
        raise HTTPException(
            status_code=422,
            detail="A search query is required",
        )

    try:
        results = await _km.search_knowledge(
            search_text,
            n_results=n,
            user_id=user_id,
        )

        return {
            "query": search_text,
            "results": results,
            "count": len(results),
        }

    except Exception:
        logger.exception("Knowledge search failed")
        raise HTTPException(
            status_code=500,
            detail="Knowledge search failed",
        )


# -----------------------------------------------------------
# Knowledge metrics
# -----------------------------------------------------------

@router.get("/metrics", summary="User knowledge metrics")
async def knowledge_metrics(
    user_id: str = Depends(get_current_user_id),
):
    try:
        return await _km.get_metrics(user_id=user_id)

    except Exception:
        logger.exception("Failed to compute knowledge metrics")
        raise HTTPException(
            status_code=500,
            detail="Failed to compute knowledge metrics",
        )


# -----------------------------------------------------------
# Upload documents
# -----------------------------------------------------------


@router.post("/upload", summary="Upload a knowledge document")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a PDF, TXT, or Markdown document for this user."""

    from agent.document_processor import document_processor

    filename = file.filename or ""

    if not filename.lower().endswith((".pdf", ".txt", ".md")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload PDF, TXT, or MD files.",
        )

    try:
        file_bytes = await file.read()

        return await document_processor.ingest_document(
            filename=filename,
            file_bytes=file_bytes,
            user_id=user_id,
        )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Document upload failed")
        raise HTTPException(
            status_code=500,
            detail="Document upload failed",
        )

    finally:
        await file.close()



# -----------------------------------------------------------
# Delete knowledge
# Keep dynamic routes after specific routes.
# -----------------------------------------------------------

@router.delete("/{knowledge_id}", summary="Delete user knowledge")
async def delete_knowledge(
    knowledge_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        deleted = await _km.delete_knowledge(
            knowledge_id,
            user_id=user_id,
        )

        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Knowledge entry not found.",
            )

        return {
            "deleted": True,
            "id": knowledge_id,
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Failed to delete knowledge")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete knowledge",
        )
