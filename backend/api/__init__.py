# api/__init__.py
from api.chat import router as chat_router
from api.knowledge import router as knowledge_router
from api.feedback import router as feedback_router
from api.research import router as research_router

__all__ = ["chat_router", "knowledge_router", "feedback_router", "research_router"]
