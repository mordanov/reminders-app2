from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import select

from app.config import ConfiguredUser, Settings
from app.models import Calendar, Reminder, ReminderKind, User, UserPreference
from app.passwords import PasswordHashService
from app.services import (
    accessible_text_color,
    normalize_due_at,
    purge_deleted,
    sync_configured_users,
    validate_workday,
    weekly_due_at,
)


def test_settings_and_accessible_contrast() -> None:
    settings = Settings(
        database_url="sqlite+aiosqlite://",
        auth_user_1_username="alice",
        auth_user_1_password="one",
        auth_user_2_username="bob",
        auth_user_2_password="two",
    )
    assert settings.configured_usernames == ("alice", "bob")
    assert [user.username for user in settings.configured_users] == ["alice", "bob"]
    assert accessible_text_color("#000000") == "#FFFFFF"
    assert accessible_text_color("#FFFFFF") == "#000000"


def test_workday_and_timezone_validation() -> None:
    validate_workday(date(2026, 8, 29))
    with pytest.raises(HTTPException):
        validate_workday(date(2026, 8, 30))
    normalized = normalize_due_at(datetime(2026, 8, 29, 14, tzinfo=UTC), "Europe/Madrid")
    assert normalized.tzinfo == UTC
    with pytest.raises(HTTPException):
        normalize_due_at(datetime(2026, 8, 29, 14), "Europe/Madrid")
    original = datetime(2026, 10, 19, 9, tzinfo=ZoneInfo("Europe/Madrid"))
    copied = weekly_due_at(original, 1, "Europe/Madrid")
    assert copied.astimezone(ZoneInfo("Europe/Madrid")).hour == 9
    assert copied.hour == 8
    assert normalize_due_at(original, "Europe/Madrid").hour == 7


async def test_user_sync_and_purge(session_factory) -> None:
    password_service = PasswordHashService(rounds=4)
    configured = (
        ConfiguredUser("alice", SecretStr("initial-alice-password")),
        ConfiguredUser("bob", SecretStr("initial-bob-password")),
    )
    async with session_factory() as session:
        await sync_configured_users(session, configured, password_service)
        users = (await session.execute(User.__table__.select())).all()
        assert len(users) == 2
        calendars = (await session.execute(Calendar.__table__.select())).all()
        assert len(calendars) == 2

        alice = await session.scalar(select(User).where(User.username == "alice"))
        assert alice.password_hash != "initial-alice-password"
        assert alice.password_hash is not None
        assert alice.password_hash.startswith(("$2a$", "$2b$"))
        assert password_service.verify(SecretStr("initial-alice-password"), alice.password_hash)
        initial_hash = alice.password_hash

        changed = (
            ConfiguredUser("alice", SecretStr("changed-alice-password")),
            configured[1],
        )
        await sync_configured_users(session, changed, password_service)
        await session.refresh(alice)
        assert alice.password_hash != initial_hash
        assert password_service.verify(SecretStr("changed-alice-password"), alice.password_hash)
        assert not password_service.verify(SecretStr("initial-alice-password"), alice.password_hash)
        changed_hash = alice.password_hash
        await sync_configured_users(session, changed, password_service)
        await session.refresh(alice)
        assert alice.password_hash == changed_hash

        calendar = await session.scalar(select(Calendar).where(Calendar.owner_id == alice.id))
        calendar_id = calendar.id
        calendar.deleted_at = datetime.now(UTC)
        await session.commit()
        await sync_configured_users(session, changed, password_service)
        await session.refresh(calendar)
        preference = await session.get(UserPreference, alice.id)
        assert calendar.id == calendar_id
        assert calendar.deleted_at is None
        assert preference is not None
        assert preference.selected_calendar_ids == [str(calendar_id)]

        old = datetime.now(UTC) - timedelta(days=31)
        session.add(
            Reminder(
                calendar_id=calendar.id,
                kind=ReminderKind.DAY,
                text="old",
                due_date=date(2026, 8, 29),
                day_order=0,
                deleted_at=old,
            )
        )
        await session.commit()
        counts = await purge_deleted(session, 30)
        assert counts["reminders"] == 1
