"""
main.py
FastAPI application entry point for the Self-Learning AI Agent backend.
"""

import os
import logging
import time
from contextlib import asynccontextmanager

import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text

from models.database import init_db, AsyncSessionLocal, Conversation, Knowledge, Feedback, engine
from utils.auth import get_current_user_id

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

_START_TIME = time.time()
_VERSION = "1.0.0"
_CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_store")

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting ARIA backend v%s", _VERSION)

    # Initialize the selected SQL database.
    await init_db()
    logger.info(
        "ARIA database initialized: %s",
        engine.dialect.name,
    )

    if engine.dialect.name == "postgresql":
        # Cloud mode: semantic memory is handled by pgvector.
        # Do not create a local ChromaDB directory.
        app.state.chroma_client = None

        logger.info(
            "ARIA cloud mode enabled: PostgreSQL + pgvector"
        )

    else:
        # Local mode: preserve existing ChromaDB behavior.
        chroma_client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )

        app.state.chroma_client = chroma_client

        logger.info(
            "ARIA local ChromaDB initialized at %s",
            _CHROMA_PATH,
        )

    yield

    logger.info("Shutting down ARIA backend.")



# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Self-Learning AI Agent",
    description=(
        "A self-learning conversational AI backend powered by Gemini, "
        "ChromaDB vector memory, and a SQLite knowledge base."
    ),
    version=_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS (allow all origins for development)
# ---------------------------------------------------------------------------


# Allowed frontend origins.
# Example:
# CORS_ORIGINS=http://localhost:5173,https://your-aria-app.vercel.app

CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

from api.chat import router as chat_router
from api.knowledge import router as knowledge_router
from api.feedback import router as feedback_router
from api.research import router as research_router

app.include_router(chat_router, prefix="/api/chat", tags=["Chat"])
app.include_router(knowledge_router, prefix="/api/knowledge", tags=["Knowledge"])
app.include_router(feedback_router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(research_router, prefix="/api/research", tags=["Research"])

# ---------------------------------------------------------------------------
# Health & Metrics
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"], summary="Health check")
async def health():
    """Returns the service status, uptime, and version."""
    uptime_seconds = round(time.time() - _START_TIME, 2)
    return {
        "status": "ok",
        "version": _VERSION,
        "uptime_seconds": uptime_seconds,
    }


@app.get("/api/metrics", tags=["System"], summary="Aggregate dashboard metrics")
async def aggregate_metrics(
     user_id: str = Depends(get_current_user_id)):
    
    """
    Returns a consolidated view of key system metrics:
    - Total conversations (all time + today)
    - Total knowledge entries
    - Average feedback rating
    - Total feedback responses
    """
    from datetime import datetime, timedelta

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    async with AsyncSessionLocal() as db:
        # Total conversations
        total_conv_result = await db.execute(
        select(func.count(Conversation.id))
        .where(Conversation.user_id == user_id))
        total_conversations = total_conv_result.scalar() or 0

        # Conversations today
        today_conv_result = await db.execute(
            select(func.count(Conversation.id))
            .where(
                Conversation.user_id == user_id,
                Conversation.timestamp >= today_start,
            )
        )
        today_conversations = today_conv_result.scalar() or 0

        # Total knowledge entries
        know_result = await db.execute(
            select(func.count(Knowledge.id))
            .where(Knowledge.user_id == user_id)
        )
        total_knowledge = know_result.scalar() or 0

        # Average feedback — current logged-in user only
        avg_fb_result = await db.execute(
            select(func.avg(Feedback.rating))
            .join(Conversation, Feedback.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id)
        )
        avg_feedback = avg_fb_result.scalar()
        avg_feedback = round(avg_feedback, 3) if avg_feedback is not None else None

        # Total feedback count — current logged-in user only
        fb_count_result = await db.execute(
            select(func.count(Feedback.id))
            .join(Conversation, Feedback.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id)
        )
        total_feedback = fb_count_result.scalar() or 0

    return {
        "total_conversations": total_conversations,
        "today_conversations": today_conversations,
        "total_knowledge_entries": total_knowledge,
        "avg_feedback_rating": avg_feedback,
        "total_feedback_responses": total_feedback,
        "uptime_seconds": round(time.time() - _START_TIME, 2),
        "version": _VERSION,
    }


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"error": "Not Found", "path": str(request.url.path)},
    )



@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(
        "Internal server error on %s: %s",
        request.url.path,
        exc,
    )

    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error"},
    )



# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
