"""
agent/feedback.py
FeedbackEngine — stores ratings, computes improvement metrics, feeds few-shot examples.
"""

import logging
import uuid
from datetime import datetime, timedelta
from collections import defaultdict

from sqlalchemy import select, update, func, and_
from sqlalchemy.orm import joinedload

from models.database import AsyncSessionLocal, Conversation, Feedback, AgentMetrics, Knowledge

logger = logging.getLogger(__name__)


class FeedbackEngine:
    """Manages user feedback and derives learning signals."""

    # ------------------------------------------------------------------
    # Store
    # ------------------------------------------------------------------

    async def store_feedback(
        self,
        conversation_id: str,
        rating: int,
        comment: str = "",
        *,
        user_id: str,
    ) -> str:
        """
        Save a Feedback row and update the parent Conversation's
        feedback_score (average of all ratings for that conversation).
        Returns the new feedback ID.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")
        
        if not 1 <= rating <= 5:
            raise ValueError(f"Rating must be 1-5, got {rating}")

        feedback_id = str(uuid.uuid4())

        async with AsyncSessionLocal() as db:
            # Verify the conversation exists
            conv_result = await db.execute(
                select(Conversation).where(
                    Conversation.id == conversation_id,
                    Conversation.user_id == user_id,
                )
            )
            conv = conv_result.scalar_one_or_none()
            if conv is None:
                raise ValueError(f"Conversation {conversation_id!r} not found.")

            fb = Feedback(
                id=feedback_id,
                conversation_id=conversation_id,
                rating=rating,
                comment=comment or "",
            )
            db.add(fb)
            await db.flush()

            # Recompute average rating for this conversation
            avg_result = await db.execute(
                select(func.avg(Feedback.rating)).where(
                    Feedback.conversation_id == conversation_id
                )
            )
            avg_rating = avg_result.scalar() or float(rating)

            await db.execute(
                update(Conversation)
                .where(
                    Conversation.id == conversation_id,
                    Conversation.user_id == user_id,
                )
                .values(feedback_score=round(avg_rating, 2))
            )
            await db.commit()

        return feedback_id

    # ------------------------------------------------------------------
    # Few-shot examples
    # ------------------------------------------------------------------

    
    async def get_positive_examples(
        self,
        limit: int = 5,
        *,
        user_id: str,
    ) -> list[dict]:
        """Return positive feedback examples for this user only."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Conversation)
                .where(
                    Conversation.user_id == user_id,
                    Conversation.feedback_score >= 4.0,
                )
                .order_by(
                    Conversation.feedback_score.desc(),
                    Conversation.timestamp.desc(),
                )
                .limit(limit)
            )

            rows = result.scalars().all()

        return [
            {
                "user": r.user_message,
                "assistant": r.ai_response,
                "score": r.feedback_score,
            }
            for r in rows
        ]


    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    
    async def get_improvement_metrics(
        self,
        *,
        user_id: str,
    ) -> dict:
        """Calculate feedback statistics for one authenticated user."""

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        async with AsyncSessionLocal() as db:

            # Total feedback count
            count_result = await db.execute(
                select(func.count(Feedback.id))
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(Conversation.user_id == user_id)
            )
            total = count_result.scalar() or 0

            # Average feedback rating
            avg_result = await db.execute(
                select(func.avg(Feedback.rating))
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(Conversation.user_id == user_id)
            )
            avg_rating = round(avg_result.scalar() or 0.0, 3)

            # Rating distribution
            dist_result = await db.execute(
                select(
                    Feedback.rating,
                    func.count(Feedback.id).label("cnt"),
                )
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(Conversation.user_id == user_id)
                .group_by(Feedback.rating)
            )

            distribution = {str(r): 0 for r in range(1, 6)}

            for row in dist_result.all():
                distribution[str(row.rating)] = row.cnt

            # Average rating for the last 7 days
            week_ago = datetime.utcnow() - timedelta(days=7)

            week_result = await db.execute(
                select(func.avg(Feedback.rating))
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.user_id == user_id,
                    Feedback.timestamp >= week_ago,
                )
            )
            week_avg = round(week_result.scalar() or 0.0, 3)

            # Top-rated conversations for this user
            top_conv_result = await db.execute(
                select(
                    Conversation.user_message,
                    Conversation.feedback_score,
                )
                .where(
                    Conversation.user_id == user_id,
                    Conversation.feedback_score >= 4.0,
                )
                .order_by(Conversation.feedback_score.desc())
                .limit(5)
            )

            top_topics = [
                {
                    "message": r.user_message[:100],
                    "score": r.feedback_score,
                }
                for r in top_conv_result.all()
            ]

        return {
            "total_feedback_count": total,
            "avg_rating": avg_rating,
            "rating_distribution": distribution,
            "trend": {
                "last_7_days_avg": week_avg,
                "all_time_avg": avg_rating,
                "delta": round(week_avg - avg_rating, 3),
            },
            "top_topics": top_topics,
        }


    # ------------------------------------------------------------------
    # Daily metrics aggregation
    # ------------------------------------------------------------------

    
    async def compute_daily_metrics(
        self,
        *,
        user_id: str,
    ) -> dict:
        """
        Calculate today's metrics for one authenticated user.

        Uses existing Conversation, Feedback, and Knowledge
        records without modifying the shared AgentMetrics table.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        today = datetime.utcnow().date()
        today_str = today.isoformat()

        today_start = datetime.combine(
            today,
            datetime.min.time(),
        )

        tomorrow_start = today_start + timedelta(days=1)
        yesterday_start = today_start - timedelta(days=1)

        async with AsyncSessionLocal() as db:

            # Today's conversations for this user only.
            conv_result = await db.execute(
                select(func.count(Conversation.id)).where(
                    Conversation.user_id == user_id,
                    Conversation.timestamp >= today_start,
                    Conversation.timestamp < tomorrow_start,
                )
            )

            conv_count = conv_result.scalar() or 0

            # Today's feedback for this user's conversations.
            feedback_result = await db.execute(
                select(func.avg(Feedback.rating))
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.user_id == user_id,
                    Feedback.timestamp >= today_start,
                    Feedback.timestamp < tomorrow_start,
                )
            )

            avg_fb = feedback_result.scalar()
            avg_fb = round(avg_fb, 3) if avg_fb is not None else None

            # Total knowledge entries belonging to this user.
            knowledge_result = await db.execute(
                select(func.count(Knowledge.id)).where(
                    Knowledge.user_id == user_id
                )
            )

            knowledge_count = knowledge_result.scalar() or 0

            # Yesterday's feedback for this user.
            previous_result = await db.execute(
                select(func.avg(Feedback.rating))
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.user_id == user_id,
                    Feedback.timestamp >= yesterday_start,
                    Feedback.timestamp < today_start,
                )
            )

            previous_avg = previous_result.scalar()

        # Calculate improvement compared with yesterday.
        if avg_fb is not None and previous_avg is not None:
            delta = round(avg_fb - previous_avg, 3)
        else:
            delta = None

        return {
            "date": today_str,
            "total_conversations": conv_count,
            "avg_feedback": avg_fb,
            "knowledge_entries": knowledge_count,
            "improvement_delta": delta,
        }


    
    async def get_metrics_history(
        self,
        days: int = 30,
        *,
        user_id: str,
    ) -> list[dict]:
        """
        Return daily analytics for one authenticated user.

        Calculate history directly from existing records.
        Do not read or modify the shared AgentMetrics table.
        """

        if not user_id:
            raise ValueError("Authenticated user_id is required")

        days = max(1, min(days, 365))

        today = datetime.utcnow().date()
        start_date = today - timedelta(days=days - 1)
        start_datetime = datetime.combine(
            start_date, datetime.min.time()
        )

        end_datetime = datetime.combine(
            today + timedelta(days=1),
            datetime.min.time(),
        )

        conversation_counts = defaultdict(int)
        feedback_ratings = defaultdict(list)
        knowledge_counts = defaultdict(int)

        async with AsyncSessionLocal() as db:

            # Conversations belonging to this user.
            conv_result = await db.execute(
                select(Conversation.timestamp).where(
                    Conversation.user_id == user_id,
                    Conversation.timestamp >= start_datetime,
                    Conversation.timestamp < end_datetime,
                )
            )

            for (timestamp,) in conv_result.all():
                if timestamp:
                    conversation_counts[
                        timestamp.date().isoformat()
                    ] += 1

            # Feedback belonging to this user's conversations.
            fb_result = await db.execute(
                select(
                    Feedback.timestamp,
                    Feedback.rating,
                )
                .join(
                    Conversation,
                    Feedback.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.user_id == user_id,
                    Feedback.timestamp >= start_datetime,
                    Feedback.timestamp < end_datetime,
                )
            )

            for timestamp, rating in fb_result.all():
                if timestamp and rating is not None:
                    feedback_ratings[
                        timestamp.date().isoformat()
                    ].append(rating)

            # Knowledge entries created by this user.
            # Include older entries for cumulative totals.
            knowledge_result = await db.execute(
                select(Knowledge.created_at).where(
                    Knowledge.user_id == user_id,
                    Knowledge.created_at < end_datetime,
                )
            )

            for (created_at,) in knowledge_result.all():
                if created_at:
                    knowledge_counts[
                        created_at.date().isoformat()
                    ] += 1

        # Include knowledge created before the requested period.
        running_knowledge = sum(
            count
            for date, count in knowledge_counts.items()
            if date < start_date.isoformat()
        )

        history = []
        previous_avg = None

        for offset in range(days):
            current_date = start_date + timedelta(days=offset)
            date_str = current_date.isoformat()

            ratings = feedback_ratings[date_str]

            avg_feedback = (
                round(sum(ratings) / len(ratings), 3)
                if ratings else None
            )

            running_knowledge += knowledge_counts[date_str]

            if (
                avg_feedback is not None
                and previous_avg is not None
            ):
                improvement_delta = round(
                    avg_feedback - previous_avg, 3
                )
            else:
                improvement_delta = None

            history.append({
                "date": date_str,
                "total_conversations": conversation_counts[date_str],
                "avg_feedback": avg_feedback,
                "knowledge_entries": running_knowledge,
                "improvement_delta": improvement_delta,
            })

            previous_avg = avg_feedback

        return history

