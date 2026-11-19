"""
agent/knowledge.py
KnowledgeManager — structured knowledge base backed by SQLite + ChromaDB.
"""

import os
import uuid
import logging
from typing import Optional

import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv
from sqlalchemy import select, delete, func, update

from models.database import AsyncSessionLocal, Knowledge, engine
from agent.pgvector_store import PgVectorStore
from utils.embeddings import get_embedding

load_dotenv()

logger = logging.getLogger(__name__)

_CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_store")
_SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.75"))
_DEDUP_THRESHOLD = 0.9  # skip add if cosine similarity > this


class KnowledgeManager:
    """
    Persistent knowledge store with:
    - SQLite for structured metadata & retrieval statistics.
    - ChromaDB for semantic similarity search.
    - Deduplication to prevent near-duplicate entries.
    """


    def __init__(self):
        self._use_pgvector = engine.dialect.name == "postgresql"

        self._pgvector = None
        self._chroma_client = None
        self._collection = None

        if self._use_pgvector:
            # Cloud mode: Supabase PostgreSQL + pgvector.
            self._pgvector = PgVectorStore(engine)

            logger.info(
                "ARIA KnowledgeManager initialized with PostgreSQL pgvector"
            )

        else:
            # Local mode: preserve the existing ChromaDB.
            self._chroma_client = chromadb.PersistentClient(
                path=_CHROMA_PATH,
                settings=Settings(anonymized_telemetry=False),
            )

            self._collection = self._chroma_client.get_or_create_collection(
                name="knowledge",
                metadata={"hnsw:space": "cosine"},
            )

            logger.info(
                "ARIA KnowledgeManager initialized with local ChromaDB"
            )


    # ------------------------------------------------------------------
    # Add
    # ------------------------------------------------------------------


    async def add_knowledge(
        self,
        topic: str,
        content: str,
        source_url: str = "",
        confidence_score: float = 1.0,
        *,
        user_id: str,
    ) -> Optional[str]:
        """
        Save knowledge belonging to one authenticated user.
        Deduplication is restricted to the same user.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        if not content.strip():
            return None

        # Create embedding
        embedding = get_embedding(content)

        # Check duplicates belonging only to this user

        # Check duplicates belonging only to this user.
        try:
            if self._use_pgvector:
                # Cloud: find the most similar owned knowledge vector.
                matches = await self._pgvector.search(
                    kind="knowledge",
                    user_id=user_id,
                    embedding=embedding,
                    limit=1,
                )

                similarity = (
                    matches[0]["similarity"] if matches else None
                )

            else:
                # Local: preserve existing ChromaDB deduplication.
                results = self._collection.query(
                    query_embeddings=[embedding],
                    n_results=1,
                    where={"user_id": user_id},
                    include=["distances"],
                )

                similarity = None

                if results["distances"] and results["distances"][0]:
                    similarity = 1.0 - results["distances"][0][0]

            if similarity is not None and similarity >= _DEDUP_THRESHOLD:
                logger.info(
                    "Skipping duplicate knowledge entry "
                    "for user %s (similarity=%.3f)",
                    user_id,
                    similarity,
                )
                return None

        except Exception:
            logger.exception("Knowledge deduplication check failed")
            raise


        knowledge_id = str(uuid.uuid4())
        chroma_id = f"k_{knowledge_id}"

        # Save to SQLite with ownership
        async with AsyncSessionLocal() as db:
            entry = Knowledge(
                id=knowledge_id,
                user_id=user_id,
                topic=topic,
                content=content,
                source_url=source_url or "",
                chroma_id=chroma_id,
                confidence_score=confidence_score,
            )

            db.add(entry)
            await db.commit()

        # Save to ChromaDB with ownership

        # Save vector with authenticated ownership.
        try:
            metadata = {
                "user_id": user_id,
                "topic": topic,
                "knowledge_id": knowledge_id,
                "source_url": source_url or "",
            }

            if self._use_pgvector:
                # Cloud: Supabase PostgreSQL.
                await self._pgvector.add_vector(
                    kind="knowledge",
                    vector_id=chroma_id,
                    user_id=user_id,
                    document=content,
                    embedding=embedding,
                    metadata=metadata,
                )

            else:
                # Local: preserve existing ChromaDB storage.
                self._collection.add(
                    ids=[chroma_id],
                    embeddings=[embedding],
                    documents=[content],
                    metadatas=[metadata],
                )

        except Exception as exc:
            logger.error(
                "Vector storage failed for knowledge %s: %s",
                knowledge_id,
                exc,
            )

            # Roll back only this newly created knowledge entry.
            async with AsyncSessionLocal() as db:
                await db.execute(
                    delete(Knowledge).where(
                        Knowledge.id == knowledge_id,
                        Knowledge.user_id == user_id,
                    )
                )
                await db.commit()

            return None


        return knowledge_id


    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------


    async def search_knowledge(
        self,
        query: str,
        n_results: int = 5,
        *,
        user_id: str,
    ) -> list[dict]:
        """Search knowledge belonging only to this user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        if not query.strip() or n_results < 1:
            return []


        try:
            if self._use_pgvector:
                # Cloud: retrieve only this user's knowledge.
                embedding = get_embedding(query)

                matches = await self._pgvector.search(
                    kind="knowledge",
                    user_id=user_id,
                    embedding=embedding,
                    limit=n_results,
                )

                documents = [
                    item["document"] for item in matches
                ]
                metadatas = [
                    item["metadata"] or {} for item in matches
                ]
                similarities = [
                    item["similarity"] for item in matches
                ]

            else:
                # Local: preserve existing ChromaDB search.
                count = self._collection.count()

                if count == 0:
                    return []

                embedding = get_embedding(query)

                results = self._collection.query(
                    query_embeddings=[embedding],
                    n_results=min(n_results, count),
                    where={"user_id": user_id},
                    include=["documents", "metadatas", "distances"],
                )

                documents = results["documents"][0]
                metadatas = results["metadatas"][0]
                similarities = [
                    1.0 - dist
                    for dist in results["distances"][0]
                ]

        except Exception as exc:
            logger.error("Knowledge search failed: %s", exc)
            return []


        output = []
        knowledge_ids = []

        for doc, meta, score in zip(
            documents,
            metadatas,
            similarities,
        ):
            similarity = round(score, 4)


            if similarity < _SIMILARITY_THRESHOLD:
                continue

            kid = meta.get("knowledge_id", "")

            if not kid:
                continue

            knowledge_ids.append(kid)

            output.append(
                {
                    "id": kid,
                    "topic": meta.get("topic", ""),
                    "content": doc,
                    "source_url": meta.get("source_url", ""),
                    "similarity": similarity,
                }
            )

        # Update access counts for this user's entries only.
        if knowledge_ids:
            try:
                async with AsyncSessionLocal() as db:
                    await db.execute(
                        update(Knowledge)
                        .where(
                            Knowledge.id.in_(knowledge_ids),
                            Knowledge.user_id == user_id,
                        )
                        .values(
                            access_count=Knowledge.access_count + 1
                        )
                    )
                    await db.commit()

            except Exception as exc:
                logger.warning(
                    "Failed to increment knowledge access counts: %s",
                    exc,
                )

        return output


    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------


    async def get_all_knowledge(
        self,
        limit: int = 50,
        offset: int = 0,
        *,
        user_id: str,
    ) -> list[dict]:
        """Return knowledge entries belonging only to this user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Knowledge)
                .where(Knowledge.user_id == user_id)
                .order_by(Knowledge.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            rows = result.scalars().all()

        return [
            {
                "id": r.id,
                "topic": r.topic,
                "content": r.content,
                "source_url": r.source_url,
                "chroma_id": r.chroma_id,
                "created_at": r.created_at.isoformat(),
                "access_count": r.access_count,
                "confidence_score": r.confidence_score,
            }
            for r in rows
        ]


    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------


    async def delete_knowledge(
        self,
        knowledge_id: str,
        *,
        user_id: str,
    ) -> bool:
        """Delete a knowledge entry only if this user owns it."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Knowledge).where(
                    Knowledge.id == knowledge_id,
                    Knowledge.user_id == user_id,
                )
            )
            entry = result.scalar_one_or_none()

            if entry is None:
                return False

            chroma_id = entry.chroma_id

            await db.delete(entry)
            await db.commit()


        if chroma_id:
            try:
                if self._use_pgvector:
                    # Cloud: delete only the authenticated user's vector.
                    await self._pgvector.delete_vector(
                        kind="knowledge",
                        vector_id=chroma_id,
                        user_id=user_id,
                    )
                else:
                    # Local: preserve ChromaDB deletion.
                    self._collection.delete(ids=[chroma_id])

            except Exception as exc:
                logger.warning(
                    "Knowledge vector deletion failed for %s: %s",
                    chroma_id,
                    exc,
                )

        return True



    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------


    async def get_metrics(self, *, user_id: str) -> dict:
        """Return Knowledge Base statistics for one user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            total_result = await db.execute(
                select(func.count(Knowledge.id))
                .where(Knowledge.user_id == user_id)
            )
            total = total_result.scalar() or 0

            avg_conf_result = await db.execute(
                select(func.avg(Knowledge.confidence_score))
                .where(Knowledge.user_id == user_id)
            )
            avg_confidence = round(
                avg_conf_result.scalar() or 0.0, 4
            )

            top_result = await db.execute(
                select(Knowledge.topic, Knowledge.access_count)
                .where(Knowledge.user_id == user_id)
                .order_by(Knowledge.access_count.desc())
                .limit(10)
            )
            top_topics = [
                {
                    "topic": r.topic,
                    "access_count": r.access_count,
                }
                for r in top_result.all()
            ]

        return {
            "total_entries": total,
            "avg_confidence": avg_confidence,
            "top_topics": top_topics,
        }

# Shared KnowledgeManager instance
knowledge_manager = KnowledgeManager()