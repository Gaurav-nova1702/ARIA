
"""
Document Processor for extracting, chunking, and embedding PDFs & text files.
Pure Python - zero C/Rust dependencies.
"""

import io
from typing import List, Dict, Any

from pypdf import PdfReader
from agent.knowledge import knowledge_manager


class DocumentProcessor:
    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 50):
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")

        if not 0 <= chunk_overlap < chunk_size:
            raise ValueError(
                "chunk_overlap must be non-negative and smaller than chunk_size"
            )

        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        reader = PdfReader(io.BytesIO(file_bytes))
        full_text = []

        for i, page in enumerate(reader.pages):
            text = page.extract_text()

            if text:
                full_text.append(
                    f"[Page {i + 1}]\n{text.strip()}"
                )

        return "\n\n".join(full_text)

    def chunk_text(self, text: str) -> List[str]:
        words = text.split()
        chunks = []
        start = 0

        while start < len(words):
            end = start + self.chunk_size
            chunk = " ".join(words[start:end])

            if chunk.strip():
                chunks.append(chunk.strip())

            start += self.chunk_size - self.chunk_overlap

        return chunks

    async def ingest_document(
        self,
        filename: str,
        file_bytes: bytes,
        *,
        user_id: str,
    ) -> Dict[str, Any]:
        """
        Extract, chunk, and save a document under its
        authenticated Supabase user.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        if filename.lower().endswith(".pdf"):
            text = self.extract_text_from_pdf(file_bytes)
        else:
            text = file_bytes.decode(
                "utf-8",
                errors="ignore",
            )

        if not text.strip():
            return {
                "success": False,
                "error": "No readable text found in document",
                "chunks_added": 0,
            }

        chunks = self.chunk_text(text)
        added_count = 0
        topic_name = f"Doc: {filename}"

        for idx, chunk in enumerate(chunks):
            knowledge_id = await knowledge_manager.add_knowledge(
                topic=f"{topic_name} (Part {idx + 1}/{len(chunks)})",
                content=chunk,
                source_url=f"local-upload://{filename}#chunk-{idx + 1}",
                user_id=user_id,
            )

            if knowledge_id is not None:
                added_count += 1

        return {
            "success": True,
            "filename": filename,
            "total_chunks": len(chunks),
            "chunks_added": added_count,
            "topic": topic_name,
        }


document_processor = DocumentProcessor()
