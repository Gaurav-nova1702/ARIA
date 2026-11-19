"""
models/database.py
Full async SQLAlchemy models with aiosqlite backend.
"""

import os
import uuid
import json
from datetime import datetime
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    Text,
    DateTime,
    ForeignKey,
    func,
)
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./agent.db")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Conversation(Base):
    """Stores every user-AI exchange."""

    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=_new_uuid)

    # Supabase user ID — nullable to preserve existing conversations
    user_id = Column(String, nullable=True, index=True)

    session_id = Column(String, nullable=False, index=True)
    user_message = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    feedback_score = Column(Float, nullable=True)
    # Stored as a JSON string — list of {title, url, snippet}
    sources = Column(Text, nullable=True, default="[]")
    tokens_used = Column(Integer, nullable=True, default=0)

    # Relationship to Feedback
    feedbacks = relationship("Feedback", back_populates="conversation", cascade="all, delete-orphan")

    def sources_list(self):
        try:
            return json.loads(self.sources or "[]")
        except (json.JSONDecodeError, TypeError):
            return []


class Knowledge(Base):
    """Persistent knowledge base entries."""

    __tablename__ = "knowledge"

    id = Column(String, primary_key=True, default=_new_uuid)

    # Supabase Auth user ID.
    # Nullable temporarily to preserve legacy knowledge.
    user_id = Column(String, nullable=True, index=True)

    topic = Column(String, nullable=False, index=True)
    content = Column(Text, nullable=False)
    source_url = Column(String, nullable=True, default="")
    # ChromaDB document ID for cross-store deletion
    chroma_id = Column(String, nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    access_count = Column(Integer, nullable=False, default=0)
    confidence_score = Column(Float, nullable=False, default=1.0)


class Feedback(Base):
    """User ratings for specific conversations."""

    __tablename__ = "feedback"

    id = Column(String, primary_key=True, default=_new_uuid)
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1–5
    comment = Column(Text, nullable=True, default="")
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    conversation = relationship("Conversation", back_populates="feedbacks")


class ResearchCache(Base):
    """Cached web-research results keyed by query hash."""

    __tablename__ = "research_cache"

    id = Column(String, primary_key=True, default=_new_uuid)
    query_hash = Column(String, nullable=False, unique=True, index=True)
    query = Column(Text, nullable=False)
    results_json = Column(Text, nullable=False, default="{}")
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)


class AgentMetrics(Base):
    """Daily aggregate metrics for the dashboard."""

    __tablename__ = "agent_metrics"

    id = Column(String, primary_key=True, default=_new_uuid)
    # Date stored as ISO-8601 string "YYYY-MM-DD"
    date = Column(String, nullable=False, unique=True, index=True)
    total_conversations = Column(Integer, nullable=False, default=0)
    avg_feedback = Column(Float, nullable=True)
    knowledge_entries = Column(Integer, nullable=False, default=0)
    # Positive = improvement, negative = regression vs previous day
    improvement_delta = Column(Float, nullable=True)


# ---------------------------------------------------------------------------
# Dependency / helpers
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables (idempotent)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
