
"""
agent/orchestrator.py
AgentOrchestrator — central brain for ARIA.
Handles memory, knowledge retrieval, research, Gemini and persistence.
"""

import os
import logging
import time
import json

from dataclasses import dataclass, field
from dotenv import load_dotenv
from google import genai
from fastapi import BackgroundTasks

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from agent.memory import MemoryManager
from agent.knowledge import KnowledgeManager
from agent.research import ResearchTool
from agent.feedback import FeedbackEngine

load_dotenv()

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("GEMINI_API_KEY", "")
_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

if not _API_KEY:
    raise RuntimeError("GEMINI_API_KEY is missing from .env")

_SIMILARITY_THRESHOLD = float(
    os.getenv("SIMILARITY_THRESHOLD", "0.75")
)

_SYSTEM_PERSONALITY = """You are ARIA (Adaptive Reasoning & Intelligent Agent), a self-learning AI assistant.

Core traits:
- Accurate: Only state facts you are confident about; flag uncertainty.
- Adaptive: Learn from feedback and improve over time.
- Concise: Give clear, structured answers without unnecessary padding.
- Helpful: Provide relevant context when useful.

Guidelines:
- When you don't know something, say so.
- Cite sources when using retrieved knowledge or web research.
- Use Markdown when it improves readability.
- Never invent information.
"""


@dataclass
class AgentResponse:
    response_text: str
    sources: list[dict] = field(default_factory=list)
    used_memory: bool = False
    used_knowledge: bool = False
    tokens_used: int = 0
    conversation_id: str = ""


class AgentOrchestrator:

    def __init__(self):
        # Initialise all agent components.
        self._memory = MemoryManager()
        self._knowledge = KnowledgeManager()
        self._research = ResearchTool()
        self._feedback = FeedbackEngine()

        # New Gemini SDK.
        self._client = genai.Client(api_key=_API_KEY)

    # --------------------------------------------------------------
    # Main query processing
    # --------------------------------------------------------------

    async def process_query(
        self,
        session_id: str,
        user_message: str,
        search_web: bool = False,
        *,
        user_id: str,
        background_tasks: BackgroundTasks | None = None,
    ):
        if not user_id:
            raise ValueError("Authenticated user_id is required")

        start_time = time.time()
        thoughts = []

        # Step 1: Intent analysis.
        thoughts.append({
            "stage": "Intent Classification",
            "icon": "target",
            "detail": (
                "Web research requested"
                if search_web
                else "Direct knowledge and memory query"
            ),
        })

        # Step 2: Retrieve conversation memory.
        # Retrieve user-specific semantic memory asynchronously.
        mem_results = await self._memory.search_similar_conversations(
            user_message,
            n_results=3,
            user_id=user_id,
        )


        # Apply similarity threshold.
        mem_results = [
            item for item in mem_results
            if item.get("similarity", 0) >= _SIMILARITY_THRESHOLD
        ]


        # Retrieve structured knowledge.
        kb_results = await self._knowledge.search_knowledge(
            user_message,
            n_results=3,
            user_id=user_id,
        )

        history = await self._memory.get_session_history(
            session_id,
            user_id=user_id,
            limit=6,
        )

        thoughts.append({
            "stage": "Memory & Knowledge Retrieval",
            "icon": "brain",
            "detail": (
                f"Retrieved {len(mem_results)} relevant conversation memories "
                f"and {len(kb_results)} knowledge entries"
            ),
        })

        # Step 3: Optional web research.
        sources = []
        research_context = ""

        if search_web:
            thoughts.append({
                "stage": "Web Research",
                "icon": "globe",
                "detail": f"Searching for: {user_message}",
            })

            research_result = await self._research.search_and_summarize(
                user_message,
                user_id=user_id,
            )

            # Support either dictionary or object-style results.
            if isinstance(research_result, dict):
                research_context = research_result.get("summary", "")
                sources = research_result.get("sources", [])
            else:
                research_context = getattr(
                    research_result, "summary", ""
                )
                sources = getattr(
                    research_result, "sources", []
                )

        # Step 4: Feedback-based enrichment.
        few_shots = await self._feedback.get_positive_examples(
            limit=2,
            user_id=user_id,
        )

        thoughts.append({
            "stage": "Self-Reflection & Context Enrichment",
            "icon": "shield-check",
            "detail": (
                f"Applied {len(few_shots)} positive feedback examples"
            ),
        })

        # Step 5: Build prompt.
        prompt = self._build_prompt(
            user_message=user_message,
            history=history,
            similar_convs=mem_results,
            knowledge_hits=kb_results,
            research_result=research_context,
            few_shot_examples=few_shots,
        )

        thoughts.append({
            "stage": "Response Synthesis",
            "icon": "sparkles",
            "detail": f"Generating response using { _MODEL_NAME }",
        })

        # Generate response and token count.
        response_text, tokens_used = await self._call_gemini(
            prompt
        )

        # Step 6: Persist conversation.
        conv_id = await self._memory.store_conversation(
            session_id=session_id,
            user_msg=user_message,
            ai_response=response_text,
            sources=sources,
            tokens=tokens_used,
            user_id=user_id,
        )
        # Automatically learn useful information.

        # Automatically learn from the completed exchange.
        # For HTTP chat, run learning after the response is sent.
        # Preserve existing behavior for other callers.
        if background_tasks is not None:
            background_tasks.add_task(
                self._learn_from_exchange,
                user_message=user_message,
                assistant_response=response_text,
                user_id=user_id,
            )
        else:
            await self._learn_from_exchange(
                user_message=user_message,
                assistant_response=response_text,
                user_id=user_id,
            )


        total_time_ms = int(
            (time.time() - start_time) * 1000
        )

        return AgentResponse(
            response_text=response_text,
            sources=sources,
            conversation_id=conv_id,
            used_memory=bool(mem_results),
            used_knowledge=bool(kb_results),
            tokens_used=tokens_used,
)

    # --------------------------------------------------------------
    # Automatic Knowledge Learning
    # --------------------------------------------------------------

    async def _learn_from_exchange(
    self,
    user_message: str,
    assistant_response: str,
    *,
    user_id: str,
    ):
        if not user_id:
            raise ValueError("Authenticated user_id is required")
        """
        Extract useful, reusable knowledge from a completed exchange.
        Failures here must never interrupt normal chat.
        """

        try:
            extraction_prompt = f"""
logger.info("ARIA background learning started")
You are ARIA's knowledge extraction system.

Analyze this conversation and identify useful information
that should be remembered in the long-term Knowledge Base.

Save only:
- Useful factual explanations.
- Stable project information.
- Explicitly stated preferences.
- Reusable facts that may help in future conversations.
- Important information the user explicitly asks ARIA to remember.

Do NOT save:
- Greetings or casual conversation.
- Placeholder messages such as "string".
- One-time calculations or simple questions.
- Temporary information with no future value.
- Guesses, assumptions, or unsupported claims.
- Passwords, API keys, credentials, or sensitive personal information.

Only extract information supported by the conversation.
Do not invent or infer facts.

Return ONLY valid JSON in this exact format:

{{
  "items": [
    {{
      "topic": "Short descriptive title",
      "content": "Complete useful information",
      "confidence_score": 0.9
    }}
  ]
}}

If there is nothing useful to remember, return:
{{"items": []}}

USER MESSAGE:
{user_message}

ARIA RESPONSE:
{assistant_response}
"""

            result = await self._client.aio.models.generate_content(
                model=_MODEL_NAME,
                contents=extraction_prompt,
            )

            raw_text = (result.text or "").strip()

            # Remove optional Markdown JSON fences.
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[-1]
                raw_text = raw_text.rsplit("```", 1)[0].strip()

            extracted = json.loads(raw_text)
            items = extracted.get("items", [])
            if not items:
                logger.info(
                    "ARIA background learning completed: no reusable knowledge"
                )

            if not isinstance(items, list):
                return

            for item in items[:3]:
                if not isinstance(item, dict):
                    continue

                topic = str(item.get("topic", "")).strip()
                content = str(item.get("content", "")).strip()

                if not topic or len(content) < 10:
                    continue

                try:
                    confidence = float(
                        item.get("confidence_score", 0.85)
                    )
                except (TypeError, ValueError):
                    confidence = 0.85

                confidence = max(0.0, min(1.0, confidence))

                knowledge_id = await self._knowledge.add_knowledge(
                    topic=topic,
                    content=content,
                    source_url="",
                    confidence_score=confidence,
                    user_id=user_id,
                )

                if knowledge_id:
                    logger.info(
                        "Automatically saved knowledge: %s",
                        topic,
                    )

        except Exception:
            # Knowledge extraction must never break normal chat.
            logger.exception(
                "Automatic knowledge extraction failed"
            )


    # --------------------------------------------------------------
    # Prompt builder
    # --------------------------------------------------------------

    def _build_prompt(
        self,
        user_message: str,
        history: list[dict],
        similar_convs: list[dict],
        knowledge_hits: list[dict],
        research_result: str,
        few_shot_examples: list[dict],
    ) -> str:

        sections = [_SYSTEM_PERSONALITY]

        # Positive feedback examples.
        if few_shot_examples:
            sections.append("## High-Quality Response Examples")

            for example in few_shot_examples:
                sections.append(
                    f"User: {example['user']}\n"
                    f"Assistant: {example['assistant']}"
                )

        # Relevant knowledge.
        if knowledge_hits:
            sections.append("## Relevant Knowledge Base Entries")

            for item in knowledge_hits[:3]:
                sections.append(
                    f"Topic: {item['topic']} "
                    f"(similarity: {item.get('similarity', 0):.2f})\n"
                    f"{item['content'][:600]}"
                )

        # Similar past conversations.
        if similar_convs:
            sections.append("## Relevant Past Conversations")

            for item in similar_convs[:3]:
                sections.append(
                    f"(similarity: {item['similarity']:.2f})\n"
                    f"{item['document'][:400]}"
                )

        # Web research.
        if research_result:
            sections.append("## Fresh Web Research")
            sections.append(str(research_result)[:3000])

        # Session history.
        if history:
            sections.append("## Current Session History")

            for item in history[-8:]:
                sections.append(
                    f"User: {item['user_message']}"
                )
                sections.append(
                    f"Assistant: {item['ai_response']}"
                )

        # Current question.
        sections.append(
            f"## Current User Message\n{user_message}"
        )
        sections.append("## Your Response")

        return "\n\n".join(sections)

    # --------------------------------------------------------------
    # Gemini API with retry
    # --------------------------------------------------------------

    @retry(
        reraise=True,
        stop=stop_after_attempt(4),
        wait=wait_exponential(
            multiplier=1,
            min=2,
            max=20,
        ),
        retry=retry_if_exception_type(Exception),
    )
    async def _call_gemini(
        self,
        prompt: str,
    ) -> tuple[str, int]:

        response = await self._client.aio.models.generate_content(
            model=_MODEL_NAME,
            contents=prompt,
        )

        response_text = (
            response.text.strip()
            if response.text
            else ""
        )

        tokens_used = 0

        try:
            tokens_used = (
                response.usage_metadata.total_token_count or 0
            )
        except Exception:
            pass

        return response_text, tokens_used

    # --------------------------------------------------------------
    # Streaming responses
    # --------------------------------------------------------------

    async def stream_query(
        self,
        session_id: str,
        user_message: str,
        search_web: bool = False,
        *,
        user_id: str,
    ):
        if not user_id:
            raise ValueError("Authenticated user_id is required")

        """
        Stream Gemini responses and persist completed exchanges.
        """

        history = await self._memory.get_session_history(
            session_id,
            user_id=user_id,
            limit=10,
        )

        # Retrieve semantic memory for streaming too.
        similar_convs = await self._memory.search_similar_conversations(
            user_message,
            user_id=user_id,
            n_results=3,
        )

        similar_convs = [
            item for item in similar_convs
            if item.get("similarity", 0) >= _SIMILARITY_THRESHOLD
        ]

        knowledge_hits = await self._knowledge.search_knowledge(
            user_message,
            n_results=3,
            user_id=user_id,
        )

        few_shot_examples = await self._feedback.get_positive_examples(
            limit=2,
            user_id=user_id,
        )

        research_context = ""
        sources = []

        if search_web:
            try:
                research_result = await self._research.search_and_summarize(
                    user_message,
                    user_id=user_id,
                )

                if isinstance(research_result, dict):
                    research_context = research_result.get(
                        "summary", ""
                    )
                    sources = research_result.get("sources", [])
                else:
                    research_context = getattr(
                        research_result, "summary", ""
                    )
                    sources = getattr(
                        research_result, "sources", []
                    )

            except Exception as exc:
                logger.error("Stream research failed: %s", exc)

        prompt = self._build_prompt(
            user_message=user_message,
            history=history,
            similar_convs=similar_convs,
            knowledge_hits=knowledge_hits,
            research_result=research_context,
            few_shot_examples=few_shot_examples,
        )

        full_response = ""
        tokens_used = 0

        try:
            response_stream = (
                await self._client.aio.models.generate_content_stream(
                    model=_MODEL_NAME,
                    contents=prompt,
                )
            )

            async for chunk in response_stream:
                if chunk.text:
                    full_response += chunk.text
                    yield chunk.text

                if chunk.usage_metadata:
                    tokens_used = (
                        chunk.usage_metadata.total_token_count
                        or tokens_used
                    )

        except Exception as exc:
            logger.error(
                "Streaming Gemini call failed: %s",
                exc,
            )
            yield f"\n\n[Error: {exc}]"
            return

        # Save completed response.
        if full_response:
            await self._memory.store_conversation(
                session_id=session_id,
                user_msg=user_message,
                ai_response=full_response,
                sources=sources,
                tokens=tokens_used,
                user_id=user_id,
            )

            # Automatically learn useful information.
            await self._learn_from_exchange(
                user_message=user_message,
                assistant_response=full_response,
                user_id=user_id,
            )
