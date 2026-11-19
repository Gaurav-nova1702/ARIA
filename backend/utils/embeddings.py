
"""
utils/embeddings.py
Gemini embeddings using the new google-genai SDK.
Includes LRU caching and exponential back-off.
"""

import os
import logging
from functools import lru_cache

from dotenv import load_dotenv
from google import genai
from google.genai import types
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

load_dotenv()

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("GEMINI_API_KEY", "")

if not _API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

_EMBEDDING_MODEL = "gemini-embedding-001"
_EMBEDDING_DIMENSIONS = 768

_client = genai.Client(api_key=_API_KEY)


@lru_cache(maxsize=500)
def _cached_embedding(text: str, task_type: str) -> tuple:
    """Cache embeddings to avoid repeated API calls."""
    return _fetch_embedding(text, task_type)


@retry(
    reraise=True,
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=30),
    retry=retry_if_exception_type(Exception),
)
def _fetch_embedding(text: str, task_type: str) -> tuple:
    """Generate an embedding using Gemini."""

    result = _client.models.embed_content(
        model=_EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=_EMBEDDING_DIMENSIONS,
        ),
    )

    if not result.embeddings or not result.embeddings[0].values:
        raise RuntimeError("Gemini returned an empty embedding.")

    return tuple(result.embeddings[0].values)


def get_embedding(
    text: str,
    task_type: str = "RETRIEVAL_DOCUMENT",
) -> list[float]:
    """
    Generate a 768-dimensional embedding.

    Use RETRIEVAL_DOCUMENT when storing conversations.
    Use RETRIEVAL_QUERY when searching conversations.
    """

    if not text or not text.strip():
        raise ValueError("Cannot embed empty text.")

    text = text.strip()[:10_000]

    try:
        vector = _cached_embedding(text, task_type)
        return list(vector)

    except Exception:
        logger.exception(
            "Embedding generation failed. Text snippet: %s",
            text[:80],
        )
        raise
