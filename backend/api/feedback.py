
"""
api/feedback.py
Authenticated feedback endpoints for ARIA.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from agent.feedback import FeedbackEngine
from utils.auth import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter()
_fe = FeedbackEngine()


# -----------------------------------------------------------
# Request schema
# -----------------------------------------------------------

class FeedbackRequest(BaseModel):
    conversation_id: str = Field(..., min_length=1)
    rating: int = Field(
        ...,
        ge=1,
        le=5,
        description="Rating from 1 (worst) to 5 (best)",
    )
    comment: str = Field(
        "",
        description="Optional free-text comment",
    )


# -----------------------------------------------------------
# Submit feedback
# -----------------------------------------------------------

@router.post("/", summary="Submit feedback for a conversation")
async def submit_feedback(
    request: FeedbackRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Store feedback for a conversation owned by this user."""

    try:
        fb_id = await _fe.store_feedback(
            conversation_id=request.conversation_id,
            rating=request.rating,
            comment=request.comment,
            user_id=user_id,
        )

        return {
            "created": True,
            "feedback_id": fb_id,
        }

    except ValueError:
        # Do not disclose whether another user's
        # conversation ID exists.
        raise HTTPException(
            status_code=404,
            detail="Conversation not found or unavailable",
        )

    except Exception:
        logger.exception("Failed to store feedback")
        raise HTTPException(
            status_code=500,
            detail="Failed to store feedback",
        )


# -----------------------------------------------------------
# Feedback metrics
# -----------------------------------------------------------

@router.get("/metrics", summary="User feedback metrics")
async def feedback_metrics(
    user_id: str = Depends(get_current_user_id),
):
    """Return feedback metrics for this user only."""

    try:
        return await _fe.get_improvement_metrics(
            user_id=user_id,
        )

    except Exception:
        logger.exception("Failed to get improvement metrics")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve feedback metrics",
        )


# -----------------------------------------------------------
# Daily metrics computation
# -----------------------------------------------------------


@router.post("/metrics/compute", summary="Compute user daily metrics")
async def compute_metrics(
    user_id: str = Depends(get_current_user_id),
):
    """Calculate today's analytics for the authenticated user."""
    try:
        return await _fe.compute_daily_metrics(
            user_id=user_id
        )
    except Exception:
        logger.exception("Daily metrics calculation failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to calculate daily metrics",
        )



# -----------------------------------------------------------
# Metrics history
# -----------------------------------------------------------


@router.get("/metrics/history", summary="User analytics history")
async def metrics_history(
    days: int = Query(30, ge=1, le=365),
    user_id: str = Depends(get_current_user_id),
):
    """Return daily analytics history for the authenticated user."""
    try:
        history = await _fe.get_metrics_history(
            days=days,
            user_id=user_id,
        )
        return {
            "history": history,
            "count": len(history),
        }
    except Exception:
        logger.exception("Analytics history retrieval failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve analytics history",
        )

