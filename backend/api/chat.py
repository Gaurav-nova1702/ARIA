"""
api/chat.py
FastAPI router for /api/chat — standard HTTP + WebSocket endpoints.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from agent.orchestrator import AgentOrchestrator
from agent.memory import MemoryManager
from models.database import get_db
from utils.auth import get_current_user_id

logger = logging.getLogger(__name__)
router = APIRouter()

# Shared singleton instances (created once per process)
_orchestrator = AgentOrchestrator()
_memory = MemoryManager()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="Unique session identifier")
    message: str = Field(..., min_length=1, description="User message")
    search_web: bool = Field(False, description="Trigger web search for this query")


class ChatResponse(BaseModel):
    session_id: str
    conversation_id: str
    response: str
    sources: list[dict]
    used_memory: bool
    used_knowledge: bool
    tokens_used: int


# ---------------------------------------------------------------------------
# HTTP Endpoints
# ---------------------------------------------------------------------------

@router.post("/", response_model=ChatResponse, summary="Send a message to the AI agent")
async def chat(
    request: ChatRequest ,
    user_id: str = Depends(get_current_user_id),):
    """
    Send a user message and receive an AI-generated response.
    The agent retrieves relevant memory, knowledge, and optionally searches the web.
    """
    try:
        result = await _orchestrator.process_query(
            session_id=request.session_id,
            user_message=request.message,
            search_web=request.search_web,
            user_id=user_id,
        )
        return ChatResponse(
            session_id=request.session_id,
            conversation_id=result.conversation_id,
            response=result.response_text,
            sources=result.sources,
            used_memory=result.used_memory,
            used_knowledge=result.used_knowledge,
            tokens_used=result.tokens_used,
        )
    except Exception as exc:
        logger.exception("Chat processing failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get(
    "/history/{session_id}",
    summary="Get conversation history for a session",
)
async def get_history(session_id: str, limit: int = 20,user_id: str = Depends(get_current_user_id),):
    """Return the conversation history for the given session ID."""
    try:
        history = await _memory.get_session_history(session_id,user_id=user_id,limit=limit)
        return {"session_id": session_id, "history": history, "count": len(history)}
    except Exception as exc:
        logger.exception("Failed to retrieve history")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sessions", summary="List all sessions with message counts")
async def list_sessions(user_id: str = Depends(get_current_user_id)):
    """Return all unique session IDs and their message counts."""
    try:
        sessions = await _memory.get_all_sessions(user_id=user_id)
        return {"sessions": sessions, "total": len(sessions)}
    except Exception as exc:
        logger.exception("Failed to list sessions")
        raise HTTPException(status_code=500, detail=str(exc))


'''@router.delete(
    "/session/{session_id}",
    summary="Clear session memory",
)
async def delete_session(session_id: str):
    """
    Delete all conversation records for the given session and remove
    their ChromaDB vectors.
    """
    try:
        count = await _memory.delete_session(session_id)
        return {"deleted": True, "messages_removed": count, "session_id": session_id}
    except Exception as exc:
        logger.exception("Failed to delete session")
        raise HTTPException(status_code=500, detail=str(exc))
'''

# ---------------------------------------------------------------------------
# WebSocket — streaming tokens
# ---------------------------------------------------------------------------


@router.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    Temporarily disable WebSocket streaming until
    Supabase authentication is implemented.
    """

    logger.warning(
        "Unauthenticated WebSocket connection rejected: session=%s",
        session_id,
    )

    await websocket.close(
        code=1008,
        reason="WebSocket authentication is required",
    )
