from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import ConfiguredUser
from app.models import (
    AuditLog,
    Calendar,
    CalendarMember,
    FloatingCategory,
    FloatingTask,
    Reminder,
    ReminderTag,
    Tag,
    User,
    UserPreference,
)
from app.passwords import PasswordHashService, password_hash_service


def accessible_calendars(user_id: uuid.UUID) -> Select[tuple[Calendar]]:
    shared = select(CalendarMember.calendar_id).where(CalendarMember.user_id == user_id)
    return select(Calendar).where(
        Calendar.deleted_at.is_(None),
        or_(Calendar.owner_id == user_id, Calendar.id.in_(shared)),
    )


async def require_calendar_access(
    session: AsyncSession, calendar_id: uuid.UUID, user_id: uuid.UUID
) -> Calendar:
    calendar = await session.scalar(accessible_calendars(user_id).where(Calendar.id == calendar_id))
    if calendar is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "calendar not found")
    return calendar


async def require_calendar_owner(
    session: AsyncSession, calendar_id: uuid.UUID, user_id: uuid.UUID
) -> Calendar:
    calendar = await session.scalar(
        select(Calendar).where(
            Calendar.id == calendar_id,
            Calendar.owner_id == user_id,
            Calendar.deleted_at.is_(None),
        )
    )
    if calendar is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "owned calendar not found")
    return calendar


def accessible_text_color(background: str) -> str:
    red, green, blue = (int(background[index : index + 2], 16) for index in (1, 3, 5))

    def channel(value: int) -> float:
        normalized = value / 255
        return (
            normalized / 12.92 if normalized <= 0.04045 else ((normalized + 0.055) / 1.055) ** 2.4
        )

    luminance = 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    white_contrast = 1.05 / (luminance + 0.05)
    return "#FFFFFF" if white_contrast >= 4.5 else "#000000"


def validate_workday(value: date) -> None:
    if value.weekday() == 6:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Sunday is not supported")


def normalize_due_at(value: datetime, timezone_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "due_at must include an explicit UTC offset"
        )
    local = value.astimezone(ZoneInfo(timezone_name))
    validate_workday(local.date())
    return value.astimezone(UTC)


def weekly_due_at(value: datetime, week_offset: int, timezone_name: str) -> datetime:
    zone = ZoneInfo(timezone_name)
    base_wall_clock = normalize_due_at(value, timezone_name).astimezone(zone).replace(tzinfo=None)
    wall_clock = base_wall_clock + timedelta(weeks=week_offset)
    occurrence = wall_clock.replace(tzinfo=zone).astimezone(UTC)
    round_trip = occurrence.astimezone(zone).replace(tzinfo=None)
    if round_trip != wall_clock:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "weekly copy falls in a daylight-saving time gap",
        )
    validate_workday(round_trip.date())
    return occurrence


async def audit(
    session: AsyncSession,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    details: dict[str, object] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details or {},
        )
    )


async def remove_calendar_from_preferences(
    session: AsyncSession,
    calendar_id: uuid.UUID,
    user_ids: set[uuid.UUID] | None = None,
) -> None:
    statement = select(UserPreference)
    if user_ids is not None:
        statement = statement.where(UserPreference.user_id.in_(user_ids))
    preferences = (await session.scalars(statement)).all()
    calendar_value = str(calendar_id)
    for preference in preferences:
        preference.selected_calendar_ids = [
            item for item in preference.selected_calendar_ids if item != calendar_value
        ]


async def sync_configured_users(
    session: AsyncSession,
    configured_users: tuple[ConfiguredUser, ...],
    password_service: PasswordHashService = password_hash_service,
) -> None:
    if not configured_users:
        return
    usernames = {configured.username for configured in configured_users}
    existing = {user.username: user for user in (await session.scalars(select(User))).all()}
    for user in existing.values():
        user.active = user.username in usernames
    for configured in configured_users:
        synced_user = existing.get(configured.username)
        if synced_user is None:
            synced_user = User(
                username=configured.username,
                password_hash=password_service.hash(configured.password),
                active=True,
            )
            session.add(synced_user)
            await session.flush()
        else:
            synced_user.active = True
            if password_service.needs_update(configured.password, synced_user.password_hash):
                synced_user.password_hash = password_service.hash(configured.password)

        owned_count = await session.scalar(
            select(func.count())
            .select_from(Calendar)
            .where(Calendar.owner_id == synced_user.id, Calendar.deleted_at.is_(None))
        )
        if (owned_count or 0) == 0:
            calendar = await session.scalar(
                select(Calendar)
                .where(
                    Calendar.owner_id == synced_user.id,
                    Calendar.name == "Личный",
                )
                .order_by(Calendar.deleted_at.desc())
                .limit(1)
            )
            if calendar is None:
                calendar = Calendar(
                    owner_id=synced_user.id,
                    name="Личный",
                    color="#2563EB",
                    text_color=accessible_text_color("#2563EB"),
                )
                session.add(calendar)
            else:
                calendar.deleted_at = None
                calendar.color = "#2563EB"
                calendar.text_color = accessible_text_color("#2563EB")
                await session.execute(
                    delete(CalendarMember).where(CalendarMember.calendar_id == calendar.id)
                )
            await session.flush()
            preference = await session.get(UserPreference, synced_user.id)
            if preference is None:
                session.add(
                    UserPreference(
                        user_id=synced_user.id,
                        selected_calendar_ids=[str(calendar.id)],
                    )
                )
            else:
                preference.selected_calendar_ids = [str(calendar.id)]
        elif not await session.get(UserPreference, synced_user.id):
            session.add(
                UserPreference(
                    user_id=synced_user.id,
                    selected_calendar_ids=[],
                )
            )

    global_category = await session.scalar(
        select(FloatingCategory).where(
            FloatingCategory.global_category.is_(True),
            FloatingCategory.deleted_at.is_(None),
        )
    )
    if global_category is None:
        session.add(
            FloatingCategory(
                owner_id=None,
                name="Без категории",
                position=0,
                global_category=True,
            )
        )
    await session.commit()


async def validate_tag_ids(
    session: AsyncSession, calendar_id: uuid.UUID, tag_ids: list[uuid.UUID]
) -> list[Tag]:
    if len(set(tag_ids)) != len(tag_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "tag IDs must be unique")
    if not tag_ids:
        return []
    tags = (
        await session.scalars(
            select(Tag).where(
                Tag.id.in_(tag_ids),
                Tag.calendar_id == calendar_id,
                Tag.deleted_at.is_(None),
            )
        )
    ).all()
    if len(tags) != len(tag_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid calendar tag")
    return list(tags)


async def reminder_tag_ids(
    session: AsyncSession, reminder_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    result: dict[uuid.UUID, list[uuid.UUID]] = {reminder_id: [] for reminder_id in reminder_ids}
    if not reminder_ids:
        return result
    rows = (
        await session.execute(
            select(ReminderTag.reminder_id, ReminderTag.tag_id).where(
                ReminderTag.reminder_id.in_(reminder_ids),
                ReminderTag.tag_id.in_(select(Tag.id).where(Tag.deleted_at.is_(None))),
            )
        )
    ).all()
    for reminder_id, tag_id in rows:
        result[reminder_id].append(tag_id)
    return result


async def replace_reminder_tags(
    session: AsyncSession, reminder_id: uuid.UUID, tag_ids: list[uuid.UUID]
) -> None:
    await session.execute(delete(ReminderTag).where(ReminderTag.reminder_id == reminder_id))
    session.add_all(ReminderTag(reminder_id=reminder_id, tag_id=tag_id) for tag_id in tag_ids)


async def copy_tags_for_calendar_move(
    session: AsyncSession, reminder_id: uuid.UUID, target_calendar_id: uuid.UUID
) -> list[uuid.UUID]:
    source_tags = (
        await session.scalars(
            select(Tag)
            .join(ReminderTag, ReminderTag.tag_id == Tag.id)
            .where(ReminderTag.reminder_id == reminder_id, Tag.deleted_at.is_(None))
        )
    ).all()
    copied: list[uuid.UUID] = []
    for source in source_tags:
        target = await session.scalar(
            select(Tag).where(
                Tag.calendar_id == target_calendar_id,
                Tag.name == source.name,
                Tag.deleted_at.is_(None),
            )
        )
        if target is None:
            count = await session.scalar(
                select(func.count())
                .select_from(Tag)
                .where(Tag.calendar_id == target_calendar_id, Tag.deleted_at.is_(None))
            )
            if (count or 0) >= 50:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "target calendar tag limit prevents moving this reminder",
                )
            target = Tag(calendar_id=target_calendar_id, name=source.name)
            session.add(target)
            await session.flush()
        copied.append(target.id)
    await replace_reminder_tags(session, reminder_id, copied)
    return copied


async def soft_delete_calendar_contents(
    session: AsyncSession, calendar_id: uuid.UUID, deleted_at: datetime
) -> None:
    for model in (Reminder, Tag, FloatingTask):
        await session.execute(
            update(model)
            .where(model.calendar_id == calendar_id, model.deleted_at.is_(None))
            .values(deleted_at=deleted_at)
        )


async def purge_deleted(session: AsyncSession, retention_days: int) -> dict[str, int]:
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    counts: dict[str, int] = {}
    # Calendars physically cascade all remaining child and membership rows.
    for label, model in (
        ("calendars", Calendar),
        ("reminders", Reminder),
        ("tags", Tag),
        ("floating_tasks", FloatingTask),
        ("floating_categories", FloatingCategory),
    ):
        deleted_ids = await session.scalars(
            delete(model).where(model.deleted_at < cutoff).returning(model.id)
        )
        counts[label] = len(deleted_ids.all())
    await session.commit()
    return counts


async def require_category(
    session: AsyncSession, category_id: uuid.UUID, user_id: uuid.UUID
) -> FloatingCategory:
    category = await session.scalar(
        select(FloatingCategory).where(
            FloatingCategory.id == category_id,
            FloatingCategory.deleted_at.is_(None),
            or_(
                FloatingCategory.global_category.is_(True),
                and_(
                    FloatingCategory.owner_id == user_id,
                    FloatingCategory.global_category.is_(False),
                ),
            ),
        )
    )
    if category is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "category not available")
    return category
