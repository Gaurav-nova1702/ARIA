
"""
agent/memory.py
MemoryManager — session history (SQLite) + semantic search (ChromaDB).
"""

import os
import json
import logging
import uuid
from typing import Optional

import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv
from sqlalchemy import select, delete, func
from google import genai

from models.database import AsyncSessionLocal, Conversation
from utils.embeddings import get_embedding

load_dotenv()

logger = logging.getLogger(__name__)

_CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_store")
_MAX_MEMORY = int(os.getenv("MAX_MEMORY_MESSAGES", "20"))
_API_KEY = os.getenv("GEMINI_API_KEY", "")
_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

# Initialise the new Gemini SDK client.
_gemini_client = genai.Client(api_key=_API_KEY) if _API_KEY else None


class MemoryManager:
    """
    Manages two layers of memory:
    1. Short-term / session memory — stored in SQLite.
    2. Semantic / episodic memory — stored in ChromaDB.
    """

    def __init__(self):
        self._chroma_client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )

        self._collection = self._chroma_client.get_or_create_collection(
            name="conversations_gemini_embedding_001",
            metadata={"hnsw:space": "cosine"},
        )

    # --------------------------------------------------------------
    # Session history (SQLite)
    # --------------------------------------------------------------

   
    async def get_session_history(
        self,
        session_id: str,
        user_id: str,
        limit: int = 10,
    ) -> list[dict]:
        """Return only the authenticated user's session history."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Conversation)
                .where(
                    Conversation.session_id == session_id,
                    Conversation.user_id == user_id,
                )
                .order_by(Conversation.timestamp.desc())
                .limit(limit)
            )
            rows = result.scalars().all()

        return [
            {
                "id": r.id,
                "session_id": r.session_id,
                "user_message": r.user_message,
                "ai_response": r.ai_response,
                "timestamp": r.timestamp.isoformat(),
                "feedback_score": r.feedback_score,
                "sources": r.sources_list(),
                "tokens_used": r.tokens_used,
            }
            for r in reversed(rows)
        ]


    
    async def store_conversation(
        self,
        session_id: str,
        user_msg: str,
        ai_response: str,
        sources: list[dict] | None = None,
        tokens: int = 0,
        *,
        user_id: str,
    ) -> str:
        """Store a conversation under its authenticated owner."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        conv_id = str(uuid.uuid4())
        sources = sources or []

        async with AsyncSessionLocal() as db:
            conv = Conversation(
                id=conv_id,
                user_id=user_id,
                session_id=session_id,
                user_message=user_msg,
                ai_response=ai_response,
                sources=json.dumps(sources),
                tokens_used=tokens,
            )
            db.add(conv)
            await db.commit()

        # Index in ChromaDB (best-effort).
        try:
            combined = f"User: {user_msg}\nAssistant: {ai_response}"
            embedding = get_embedding(combined)

            self._collection.add(
                ids=[conv_id],
                embeddings=[embedding],
                documents=[combined],
                metadatas=[
                    {
                        "user_id": user_id,
                        "session_id": session_id,
                        "conv_id": conv_id,
                    }
                ],
            )
        except Exception as exc:
            logger.warning(
                "ChromaDB index failed for conversation %s: %s",
                conv_id,
                exc,
            )

        return conv_id


    async def delete_session(self, session_id: str) -> int:
        """Delete all conversations for a session."""

        async with AsyncSessionLocal() as db:
            # Collect IDs before deleting the SQLite records.
            result = await db.execute(
                select(Conversation.id).where(
                    Conversation.session_id == session_id
                )
            )
            ids = [row for (row,) in result.all()]

            await db.execute(
                delete(Conversation).where(
                    Conversation.session_id == session_id
                )
            )
            await db.commit()

        # Remove corresponding records from ChromaDB.
        if ids:
            try:
                self._collection.delete(ids=ids)
            except Exception as exc:
                logger.warning("ChromaDB delete failed: %s", exc)

        return len(ids)

    
    async def get_all_sessions(
        self,
        user_id: str,
    ) -> list[dict]:
        """Return archived sessions belonging only to this user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(
                    Conversation.session_id,
                    func.count(Conversation.id).label("count"),
                )
                .where(Conversation.user_id == user_id)
                .group_by(Conversation.session_id)
                .order_by(func.count(Conversation.id).desc())
            )

            rows = result.all()

        return [
            {
                "session_id": row.session_id,
                "message_count": row.count,
            }
            for row in rows
        ]


    # --------------------------------------------------------------
    # Semantic search (ChromaDB)
    # --------------------------------------------------------------

    
    def search_similar_conversations(
        self,
        query: str,
        n_results: int = 3,
        *,
        user_id: str,
    ) -> list[dict]:
        """Retrieve semantic memories belonging only to this user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        try:
            count = self._collection.count()

            if count == 0:
                return []

            embedding = get_embedding(
                query,
                task_type="RETRIEVAL_QUERY",
            )

            results = self._collection.query(
                query_embeddings=[embedding],
                n_results=min(n_results, count),
                where={"user_id": user_id},
                include=["documents", "metadatas", "distances"],
            )

            output = []

            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                output.append(
                    {
                        "document": doc,
                        "session_id": meta.get("session_id", ""),
                        "conv_id": meta.get("conv_id", ""),
                        "similarity": round(1.0 - dist, 4),
                    }
                )

            return output

        except Exception as exc:
            logger.warning("Similarity search failed: %s", exc)
            return []


    # --------------------------------------------------------------
    # Session summarisation (Gemini)
    # --------------------------------------------------------------

    async def summarize_session(
        self, 
        session_id: str,
        *,
        user_id: str,
    ) -> Optional[str]:
        """
        Summarise a session using the new Gemini SDK.
        Store the summary in the shared knowledge base.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        if _gemini_client is None:
            logger.error(
                "Cannot summarise session: GEMINI_API_KEY is missing."
            )
            return None

        history = await self.get_session_history(
            session_id,
            user_id=user_id,
            limit=_MAX_MEMORY,
        )

        if not history:
            return None

        conversation_text = "\n".join(
            f"User: {item['user_message']}\n"
            f"Assistant: {item['ai_response']}"
            for item in history
        )

        prompt = (
            "Summarise the following conversation concisely. "
            "Capture the main topics discussed, important facts, "
            "and user preferences expressed. "
            "Do not invent information.\n\n"
            f"{conversation_text}\n\n"
            "Summary:"
        )

        try:
            response = await _gemini_client.aio.models.generate_content(
                model=_MODEL_NAME,
                contents=prompt,
            )

            summary = (response.text or "").strip()

            if not summary:
                logger.warning(
                    "Gemini returned an empty session summary."
                )
                return None

        except Exception as exc:
            logger.error(
                "Session summary generation failed: %s",
                exc,
            )
            return None

        # Store the summary using the shared KnowledgeManager.
        try:
            from agent.knowledge import knowledge_manager

            await knowledge_manager.add_knowledge(
                topic=f"Session summary: {session_id[:8]}",
                content=summary,
                source_url="",
                user_id=user_id,
            )

        except Exception as exc:
            logger.warning(
                "Failed to store session summary as knowledge: %s",
                exc,
            )

        return summary
