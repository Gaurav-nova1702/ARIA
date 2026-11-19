
"""
utils/auth.py
Verify Supabase access tokens for protected ARIA endpoints.
"""

import os

import httpx
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

load_dotenv()

security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    """Return the verified Supabase user ID."""

    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_ANON_KEY", "")

    if not supabase_url or not supabase_key:
        raise HTTPException(
            status_code=503,
            detail="Supabase authentication is not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )

        if response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired session",
            )

        response.raise_for_status()
        user = response.json()

    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Unable to verify authentication",
        )

    user_id = user.get("id")

    if not user_id or user.get("is_anonymous", False):
        raise HTTPException(
            status_code=401,
            detail="Authenticated user required",
        )

    return str(user_id)
