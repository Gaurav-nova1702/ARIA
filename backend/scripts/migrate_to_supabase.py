
"""
ARIA — SQLite + ChromaDB to Supabase migration.

Reads the verified local backup.
Imports structured records and existing embeddings.
Does not modify local data or .env.

Requires empty destination tables.
All cloud inserts use one PostgreSQL transaction.
"""

import asyncio
import getpass
import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

import chromadb

from sqlalchemy import (
    Date,
    DateTime,
    func,
    insert,
    select,
    text,
)
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

# Run this script from backend/.
from models.database import Base


BACKUP_NAME = "pre-cloud-migration-20261119-180252"

BACKUP = Path("backups") / BACKUP_NAME

TABLES = [
    "conversations",
    "knowledge",
    "feedback",
    "research_cache",
    "agent_metrics",
]

VECTOR_COLLECTIONS = {
    "conversation": (
        "conversations_gemini_embedding_001",
        "aria_private.conversation_embeddings",
    ),
    "knowledge": (
        "knowledge",
        "aria_private.knowledge_embeddings",
    ),
}


def read_sqlite():
    database = BACKUP / "agent.db"

    if not database.is_file():
        raise FileNotFoundError(database)

    connection = sqlite3.connect(
        f"file:{database.resolve()}?mode=ro",
        uri=True,
    )
    connection.row_factory = sqlite3.Row

    try:
        data = {}

        for name in TABLES:
            data[name] = [
                dict(row)
                for row in connection.execute(
                    f"SELECT * FROM {name}"
                )
            ]

        return data
    finally:
        connection.close()


def read_vectors(sql_data):
    folder = BACKUP / "chroma_store"

    if not folder.is_dir():
        raise FileNotFoundError(folder)

    client = chromadb.PersistentClient(
        path=str(folder.resolve())
    )

    expected_owners = {
        "conversation": {
            row["id"]: row["user_id"]
            for row in sql_data["conversations"]
        },
        "knowledge": {
            row["chroma_id"]: row["user_id"]
            for row in sql_data["knowledge"]
        },
    }

    vector_data = {}

    for kind, (collection_name, _) in VECTOR_COLLECTIONS.items():
        collection = client.get_collection(collection_name)

        result = collection.get(
            include=[
                "embeddings",
                "documents",
                "metadatas",
            ]
        )

        records = []

        for index, vector_id in enumerate(result["ids"]):
            metadata = result["metadatas"][index] or {}
            embedding = result["embeddings"][index]
            document = result["documents"][index]

            owner = metadata.get("user_id")

            if not owner:
                raise ValueError(
                    f"Missing vector owner: {vector_id}"
                )

            if expected_owners[kind].get(vector_id) != owner:
                raise ValueError(
                    f"Vector ownership mismatch: {vector_id}"
                )

            if len(embedding) != 768:
                raise ValueError(
                    f"Invalid embedding dimensions: {vector_id}"
                )

            if not document:
                raise ValueError(
                    f"Missing vector document: {vector_id}"
                )

            records.append({
                "id": vector_id,
                "user_id": owner,
                "document": document,
                "embedding": [
                    float(value) for value in embedding
                ],
                "metadata": metadata,
            })

        if set(result["ids"]) != set(expected_owners[kind]):
            raise ValueError(
                f"Missing or extra {kind} embeddings"
            )

        vector_data[kind] = records

    return vector_data


def convert_row(table, row):
    """Convert SQLite date strings to Python date objects."""

    converted = dict(row)

    for column in table.columns:
        name = column.name
        value = converted.get(name)

        if value is None or not isinstance(value, str):
            continue

        if isinstance(column.type, DateTime):
            converted[name] = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )

        elif isinstance(column.type, Date):
            converted[name] = date.fromisoformat(
                value[:10]
            )

    return converted


async def migrate(engine, sql_data, vector_data):
    # A single transaction protects against partial imports.
    async with engine.begin() as connection:

        print("\nChecking cloud destination...")

        for name in TABLES:
            table = Base.metadata.tables[name]

            count = await connection.scalar(
                select(func.count()).select_from(table)
            )

            if count != 0:
                raise RuntimeError(
                    f"Cloud table {name} already contains "
                    f"{count} records. Migration cancelled."
                )

        for _, (_, cloud_table) in VECTOR_COLLECTIONS.items():
            count = await connection.scalar(
                text(f"SELECT COUNT(*) FROM {cloud_table}")
            )

            if count != 0:
                raise RuntimeError(
                    f"{cloud_table} contains {count} vectors. "
                    "Migration cancelled."
                )

        print("Cloud tables are empty.")

        # Parent conversation records must precede feedback.
        for name in TABLES:
            rows = sql_data[name]

            if not rows:
                continue

            table = Base.metadata.tables[name]

            converted = [
                convert_row(table, row)
                for row in rows
            ]

            await connection.execute(
                insert(table),
                converted,
            )

            print(f"Imported {name}: {len(rows)}")

        for kind, records in vector_data.items():
            cloud_table = VECTOR_COLLECTIONS[kind][1]

            statement = text(f"""
                INSERT INTO {cloud_table}
                    (id, user_id, document, embedding, metadata)
                VALUES (
                    :id,
                    :user_id,
                    :document,
                    CAST(:embedding AS extensions.vector(768)),
                    CAST(:metadata AS jsonb)
                )
            """)

            for record in records:
                vector_literal = (
                    "["
                    + ",".join(
                        str(x) for x in record["embedding"]
                    )
                    + "]"
                )

                await connection.execute(
                    statement,
                    {
                        "id": record["id"],
                        "user_id": record["user_id"],
                        "document": record["document"],
                        "embedding": vector_literal,
                        "metadata": json.dumps(record["metadata"]),
                    },
                )

            print(f"Imported {kind} vectors: {len(records)}")

        # Validate counts before committing.
        for name in TABLES:
            table = Base.metadata.tables[name]

            count = await connection.scalar(
                select(func.count()).select_from(table)
            )

            if count != len(sql_data[name]):
                raise RuntimeError(
                    f"Verification failed for {name}"
                )

        for kind, records in vector_data.items():
            cloud_table = VECTOR_COLLECTIONS[kind][1]

            count = await connection.scalar(
                text(f"SELECT COUNT(*) FROM {cloud_table}")
            )

            if count != len(records):
                raise RuntimeError(
                    f"Vector verification failed for {kind}"
                )

        print("\nAll counts verified inside transaction.")

    print("PostgreSQL transaction committed successfully.")


async def main():
    print("\n========== ARIA CLOUD MIGRATION ==========\n")
    print("Backup:", BACKUP)


    sql_data = read_sqlite()

    # Identify feedback records with missing conversations.
    conversation_ids = {
        row["id"]
        for row in sql_data["conversations"]
    }

    original_feedback = sql_data["feedback"]

    valid_feedback = [
        row
        for row in original_feedback
        if row["conversation_id"] in conversation_ids
    ]

    orphaned_feedback = [
        row
        for row in original_feedback
        if row["conversation_id"] not in conversation_ids
    ]

    if orphaned_feedback:
        print(
            "\nWARNING:",
            len(orphaned_feedback),
            "orphaned feedback record(s) cannot be imported."
        )

        print(
            "Orphaned feedback remains preserved in:",
            BACKUP / "agent.db"
        )

        for row in orphaned_feedback:
            print("Skipped feedback ID:", row["id"])

    # Only valid feedback is transferred to PostgreSQL.
    sql_data["feedback"] = valid_feedback

    vector_data = read_vectors(sql_data)


    print("\nSource data verified:")

    for name, records in sql_data.items():
        print(f"{name}: {len(records)}")

    for kind, records in vector_data.items():
        print(f"{kind} vectors: {len(records)}")

    print("\nNo local data will be changed.")

    uri = getpass.getpass(
        "\nPaste Supabase Session pooler URI: "
    ).strip()

    password = getpass.getpass(
        "Enter database password: "
    )

    url = make_url(uri).set(
        drivername="postgresql+asyncpg",
        password=password,
    )

    engine = create_async_engine(
        url,
        connect_args={"ssl": "require"},
        pool_pre_ping=True,
    )

    try:
        await migrate(engine, sql_data, vector_data)
    finally:
        await engine.dispose()

    print("\n✓ ARIA CLOUD MIGRATION COMPLETE!")


if __name__ == "__main__":
    asyncio.run(main())
