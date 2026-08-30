from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.models import User


async def current_user(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    authenticated_user: Annotated[str | None, Header(alias="X-Authenticated-User")] = None,
    internal_secret: Annotated[str | None, Header(alias="X-Internal-Secret")] = None,
) -> User:
    expected = settings.internal_auth_secret.get_secret_value()
    if (
        not authenticated_user
        or not internal_secret
        or not secrets.compare_digest(internal_secret, expected)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "untrusted request")
    user = await session.scalar(
        select(User).where(User.username == authenticated_user, User.active.is_(True))
    )
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "unknown or inactive user")
    return user
