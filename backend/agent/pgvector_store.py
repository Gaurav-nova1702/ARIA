
"""
agent/pgvector_store.py

ARIA PostgreSQL vector storage.

Provides user-isolated storage and cosine similarity
search for 768-dimensional Gemini embeddings.
"""

import json
import math
from typing import Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


VectorKind = Literal["conversation", "knowledge"]

_TABLES = {
    "conversation": "aria_private.conversation_embeddings",
    "knowledge": "aria_private.knowledge_embeddings",
}

_EMBEDDING_DIMENSIONS = 768


class PgVectorStore:
    """User-specific vector storage backed by PostgreSQL."""

    def __init__(self, engine: AsyncEngine):
        self._engine = engine

    def _table(self, kind: VectorKind) -> str:
        if kind not in _TABLES:
            raise ValueError("Invalid vector collection")

        return _TABLES[kind]

    @staticmethod
    def _vector_literal(embedding: list[float]) -> str:
        if len(embedding) != _EMBEDDING_DIMENSIONS:
            raise ValueError(
                "Expected 768 embedding dimensions, "
                f"received {len(embedding)}"
            )

        if not all(math.isfinite(float(x)) for x in embedding):
            raise ValueError("Embedding contains invalid numbers")

        return "[" + ",".join(str(float(x)) for x in embedding) + "]"

    async def add_vector(
        self,
        *,
        kind: VectorKind,
        vector_id: str,
        user_id: str,
        document: str,
        embedding: list[float],
        metadata: dict | None = None,
    ) -> None:
        if not user_id or not vector_id:
            raise ValueError("User ID and vector ID are required")

        table = self._table(kind)
        vector = self._vector_literal(embedding)

        statement = text(f"""
            INSERT INTO {table}
                (id, user_id, document, embedding, metadata)
            VALUES
                (
                    :id,
                    :user_id,
                    :document,
                    CAST(:embedding AS extensions.vector(768)),
                    CAST(:metadata AS jsonb)
                )
            ON CONFLICT (id)
            DO UPDATE SET
                document = EXCLUDED.document,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata
            WHERE {table}.user_id = EXCLUDED.user_id
        """)

        async with self._engine.begin() as connection:
            result = await connection.execute(
                statement,
                {
                    "id": vector_id,
                    "user_id": user_id,
                    "document": document,
                    "embedding": vector,
                    "metadata": json.dumps(metadata or {}),
                },
            )

            if result.rowcount == 0:
                raise PermissionError(
                    "Vector ID already belongs to another user"
                )

    async def search(
        self,
        *,
        kind: VectorKind,
        user_id: str,
        embedding: list[float],
        limit: int = 3,
    ) -> list[dict]:
        if not user_id:
            raise ValueError("Authenticated user ID is required")

        table = self._table(kind)
        vector = self._vector_literal(embedding)
        limit = max(1, min(int(limit), 50))

        statement = text(f"""
            SELECT
                id,
                document,
                metadata,
                1 - (
                    embedding <=>
                    CAST(:embedding AS extensions.vector(768))
                ) AS similarity
            FROM {table}
            WHERE user_id = :user_id
            ORDER BY
                embedding <=>
                CAST(:embedding AS extensions.vector(768))
            LIMIT :limit
        """)

        async with self._engine.connect() as connection:
            result = await connection.execute(
                statement,
                {
                    "user_id": user_id,
                    "embedding": vector,
                    "limit": limit,
                },
            )

            return [
                {
                    "id": row.id,
                    "document": row.document,
                    "metadata": row.metadata,
                    "similarity": float(row.similarity),
                }
                for row in result
            ]

    async def delete_vector(
        self,
        *,
        kind: VectorKind,
        vector_id: str,
        user_id: str,
    ) -> bool:
        if not user_id or not vector_id:
            raise ValueError("User ID and vector ID are required")

        table = self._table(kind)

        statement = text(f"""
            DELETE FROM {table}
            WHERE id = :id AND user_id = :user_id
        """)

        async with self._engine.begin() as connection:
            result = await connection.execute(
                statement,
                {
                    "id": vector_id,
                    "user_id": user_id,
                },
            )

            return result.rowcount > 0
