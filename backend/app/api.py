from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.events import ChangeBroker
from app.models import (
    Calendar,
    CalendarMember,
    FloatingCategory,
    FloatingTask,
    Notebook,
    Reminder,
    ReminderKind,
    ReminderTag,
    Tag,
    User,
    UserPreference,
    WeekNote,
)
from app.schemas import (
    CalendarCreate,
    CalendarOut,
    CalendarUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    DayBoardUpdate,
    FloatingTaskCreate,
    FloatingTaskOut,
    FloatingTaskUpdate,
    Message,
    MonthOut,
    NotebookCreate,
    NotebookOut,
    NotebookUpdate,
    PreferenceOut,
    PreferenceUpdate,
    ReminderCreate,
    ReminderCreateResult,
    ReminderOut,
    ReminderUpdate,
    ReorderRequest,
    ShareCreate,
    ShareOut,
    TagCreate,
    TagOut,
    UserOut,
    WeekNoteIn,
    WeekNoteOut,
    WeekOut,
)
from app.security import current_user
from app.services import (
    accessible_calendars,
    accessible_text_color,
    audit,
    copy_tags_for_calendar_move,
    normalize_due_at,
    reminder_tag_ids,
    remove_calendar_from_preferences,
    replace_reminder_tags,
    require_calendar_access,
    require_calendar_owner,
    require_category,
    soft_delete_calendar_contents,
    validate_tag_ids,
    validate_workday,
    weekly_due_at,
)

router = APIRouter(prefix="/api")
Session = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(current_user)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def broker(request: Request) -> ChangeBroker:
    return cast(ChangeBroker, request.app.state.broker)


async def publish(request: Request, event_type: str, entity_id: uuid.UUID | str) -> None:
    await broker(request).publish({"type": event_type, "entity_id": str(entity_id)})


async def reminder_outputs(session: AsyncSession, reminders: list[Reminder]) -> list[ReminderOut]:
    tags = await reminder_tag_ids(session, [item.id for item in reminders])
    return [
        ReminderOut.model_validate(item).model_copy(update={"tag_ids": tags[item.id]})
        for item in reminders
    ]


@router.get("/health", response_model=Message, tags=["system"])
async def health(_user: CurrentUser) -> Message:
    return Message(detail="ok")


@router.get("/me", response_model=UserOut, tags=["preferences"])
async def me(user: CurrentUser) -> User:
    return user


@router.get("/preferences", response_model=PreferenceOut, tags=["preferences"])
async def get_preferences(session: Session, user: CurrentUser) -> PreferenceOut:
    preference = await session.get(UserPreference, user.id)
    if preference is None:
        preference = UserPreference(user_id=user.id, selected_calendar_ids=[])
        session.add(preference)
        await session.commit()
    accessible_ids = {
        str(item)
        for item in (
            await session.scalars(select(accessible_calendars(user.id).subquery().c.id))
        ).all()
    }
    sanitized = [item for item in preference.selected_calendar_ids if item in accessible_ids]
    if sanitized != preference.selected_calendar_ids:
        preference.selected_calendar_ids = sanitized
        await session.commit()
    return PreferenceOut(
        selected_calendar_ids=[uuid.UUID(value) for value in preference.selected_calendar_ids],
        locale=preference.locale,
    )


@router.patch("/preferences", response_model=PreferenceOut, tags=["preferences"])
async def update_preferences(
    payload: PreferenceUpdate, request: Request, session: Session, user: CurrentUser
) -> PreferenceOut:
    preference = await session.get(UserPreference, user.id)
    if preference is None:
        preference = UserPreference(user_id=user.id, selected_calendar_ids=[])
        session.add(preference)
    if payload.selected_calendar_ids is not None:
        accessible = (
            await session.scalars(
                accessible_calendars(user.id).where(Calendar.id.in_(payload.selected_calendar_ids))
            )
        ).all()
        if len(accessible) != len(set(payload.selected_calendar_ids)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "inaccessible calendar")
        preference.selected_calendar_ids = [str(item) for item in payload.selected_calendar_ids]
    if payload.locale is not None:
        preference.locale = payload.locale
    await audit(session, user, "preferences.update", "user", user.id)
    await session.commit()
    await publish(request, "preferences.updated", user.id)
    return PreferenceOut(
        selected_calendar_ids=[uuid.UUID(value) for value in preference.selected_calendar_ids],
        locale=preference.locale,
    )


@router.get("/calendars", response_model=list[CalendarOut], tags=["calendars"])
async def list_calendars(session: Session, user: CurrentUser) -> list[CalendarOut]:
    calendars = (await session.scalars(accessible_calendars(user.id).order_by(Calendar.name))).all()
    return [
        CalendarOut.model_validate(item).model_copy(update={"is_owner": item.owner_id == user.id})
        for item in calendars
    ]


@router.post(
    "/calendars",
    response_model=CalendarOut,
    status_code=status.HTTP_201_CREATED,
    tags=["calendars"],
)
async def create_calendar(
    payload: CalendarCreate, request: Request, session: Session, user: CurrentUser
) -> CalendarOut:
    count = await session.scalar(
        select(func.count())
        .select_from(Calendar)
        .where(Calendar.owner_id == user.id, Calendar.deleted_at.is_(None))
    )
    if (count or 0) >= 10:
        raise HTTPException(status.HTTP_409_CONFLICT, "owned calendar limit reached")
    calendar = Calendar(
        id=uuid.uuid4(),
        owner_id=user.id,
        name=payload.name.strip(),
        color=payload.color.upper(),
        text_color=accessible_text_color(payload.color),
    )
    session.add(calendar)
    await audit(session, user, "calendar.create", "calendar", calendar.id)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "calendar name already exists") from exc
    await session.refresh(calendar)
    await publish(request, "calendar.created", calendar.id)
    return CalendarOut.model_validate(calendar).model_copy(update={"is_owner": True})


@router.patch("/calendars/{calendar_id}", response_model=CalendarOut, tags=["calendars"])
async def update_calendar(
    calendar_id: uuid.UUID,
    payload: CalendarUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> CalendarOut:
    calendar = await require_calendar_owner(session, calendar_id, user.id)
    if calendar.version != payload.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale calendar version")
    if payload.name is not None:
        calendar.name = payload.name.strip()
    if payload.color is not None:
        calendar.color = payload.color.upper()
        calendar.text_color = accessible_text_color(payload.color)
    calendar.version += 1
    await audit(session, user, "calendar.update", "calendar", calendar.id)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "calendar name already exists") from exc
    await publish(request, "calendar.updated", calendar.id)
    return CalendarOut.model_validate(calendar).model_copy(update={"is_owner": True})


@router.delete("/calendars/{calendar_id}", response_model=Message, tags=["calendars"])
async def delete_calendar(
    calendar_id: uuid.UUID,
    version: Annotated[int, Query(ge=1)],
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    calendar = await require_calendar_owner(session, calendar_id, user.id)
    if calendar.version != version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale calendar version")
    now = datetime.now(UTC)
    calendar.deleted_at = now
    await soft_delete_calendar_contents(session, calendar.id, now)
    await remove_calendar_from_preferences(session, calendar.id)
    await audit(session, user, "calendar.delete", "calendar", calendar.id)
    await session.commit()
    await publish(request, "calendar.deleted", calendar.id)
    return Message(detail="calendar scheduled for purge")


@router.get("/calendars/{calendar_id}/shares", response_model=list[ShareOut], tags=["calendars"])
async def list_shares(
    calendar_id: uuid.UUID, session: Session, user: CurrentUser
) -> list[ShareOut]:
    await require_calendar_owner(session, calendar_id, user.id)
    rows = (
        await session.execute(
            select(User, CalendarMember.role)
            .join(CalendarMember, CalendarMember.user_id == User.id)
            .where(CalendarMember.calendar_id == calendar_id)
            .order_by(User.username)
        )
    ).all()
    return [ShareOut(user=UserOut.model_validate(member), role=role) for member, role in rows]


@router.post(
    "/calendars/{calendar_id}/shares",
    response_model=ShareOut,
    status_code=status.HTTP_201_CREATED,
    tags=["calendars"],
)
async def add_share(
    calendar_id: uuid.UUID,
    payload: ShareCreate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> ShareOut:
    calendar = await require_calendar_owner(session, calendar_id, user.id)
    target = await session.scalar(
        select(User).where(User.username == payload.username, User.active.is_(True))
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "active user not found")
    if target.id == calendar.owner_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "owner cannot be shared member")
    member = await session.get(CalendarMember, (calendar.id, target.id))
    if member is None:
        member = CalendarMember(calendar_id=calendar.id, user_id=target.id, role=payload.role)
        session.add(member)
    else:
        member.role = payload.role
    await audit(session, user, "calendar.share", "calendar", calendar.id, {"user": target.username})
    await session.commit()
    await publish(request, "calendar.shared", calendar.id)
    return ShareOut(user=UserOut.model_validate(target), role=member.role)


@router.delete(
    "/calendars/{calendar_id}/shares/{member_user_id}",
    response_model=Message,
    tags=["calendars"],
)
async def remove_share(
    calendar_id: uuid.UUID,
    member_user_id: uuid.UUID,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    await require_calendar_owner(session, calendar_id, user.id)
    deleted_user_id = await session.scalar(
        delete(CalendarMember)
        .where(
            CalendarMember.calendar_id == calendar_id,
            CalendarMember.user_id == member_user_id,
        )
        .returning(CalendarMember.user_id)
    )
    if deleted_user_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "share not found")
    await remove_calendar_from_preferences(session, calendar_id, {member_user_id})
    await audit(session, user, "calendar.unshare", "calendar", calendar_id)
    await session.commit()
    await publish(request, "calendar.unshared", calendar_id)
    return Message(detail="share removed")


@router.get("/calendars/{calendar_id}/tags", response_model=list[TagOut], tags=["tags"])
async def list_tags(calendar_id: uuid.UUID, session: Session, user: CurrentUser) -> list[Tag]:
    await require_calendar_access(session, calendar_id, user.id)
    return list(
        (
            await session.scalars(
                select(Tag)
                .where(Tag.calendar_id == calendar_id, Tag.deleted_at.is_(None))
                .order_by(Tag.name)
            )
        ).all()
    )


@router.post(
    "/calendars/{calendar_id}/tags",
    response_model=TagOut,
    status_code=status.HTTP_201_CREATED,
    tags=["tags"],
)
async def create_tag(
    calendar_id: uuid.UUID,
    payload: TagCreate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Tag:
    await require_calendar_access(session, calendar_id, user.id)
    count = await session.scalar(
        select(func.count())
        .select_from(Tag)
        .where(Tag.calendar_id == calendar_id, Tag.deleted_at.is_(None))
    )
    if (count or 0) >= 50:
        raise HTTPException(status.HTTP_409_CONFLICT, "calendar tag limit reached")
    tag = Tag(id=uuid.uuid4(), calendar_id=calendar_id, name=payload.name.strip())
    session.add(tag)
    await audit(session, user, "tag.create", "tag", tag.id)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "tag already exists") from exc
    await session.refresh(tag)
    await publish(request, "tag.created", tag.id)
    return tag


@router.delete("/tags/{tag_id}", response_model=Message, tags=["tags"])
async def delete_tag(
    tag_id: uuid.UUID, request: Request, session: Session, user: CurrentUser
) -> Message:
    tag = await session.get(Tag, tag_id)
    if tag is None or tag.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "tag not found")
    await require_calendar_access(session, tag.calendar_id, user.id)
    tag.deleted_at = datetime.now(UTC)
    await session.execute(delete(ReminderTag).where(ReminderTag.tag_id == tag.id))
    await audit(session, user, "tag.delete", "tag", tag.id)
    await session.commit()
    await publish(request, "tag.deleted", tag.id)
    return Message(detail="tag scheduled for purge")


@router.post(
    "/reminders",
    response_model=ReminderCreateResult,
    status_code=status.HTTP_201_CREATED,
    tags=["reminders"],
)
async def create_reminders(
    payload: ReminderCreate,
    request: Request,
    session: Session,
    user: CurrentUser,
    settings: AppSettings,
) -> ReminderCreateResult:
    await require_calendar_access(session, payload.calendar_id, user.id)
    await validate_tag_ids(session, payload.calendar_id, payload.tag_ids)
    if payload.kind == ReminderKind.DAY:
        assert payload.due_date is not None
        base_date = payload.due_date
    else:
        assert payload.due_at is not None
        base_date = (
            normalize_due_at(payload.due_at, settings.app_timezone)
            .astimezone(ZoneInfo(settings.app_timezone))
            .date()
        )
    validate_workday(base_date)
    items: list[Reminder] = []
    warnings: list[str] = []
    for offset in range(payload.weekly_count):
        due_date = payload.due_date + timedelta(weeks=offset) if payload.due_date else None
        due_at = (
            weekly_due_at(payload.due_at, offset, settings.app_timezone) if payload.due_at else None
        )
        duplicate = await session.scalar(
            select(Reminder.id).where(
                Reminder.calendar_id == payload.calendar_id,
                Reminder.deleted_at.is_(None),
                Reminder.text == payload.text,
                Reminder.kind == payload.kind,
                Reminder.due_date == due_date,
                Reminder.due_at == due_at,
            )
        )
        if duplicate is not None:
            warnings.append(f"duplicate allowed for occurrence {offset + 1}")
        day_order = None
        if due_date:
            maximum = await session.scalar(
                select(func.max(Reminder.day_order)).where(
                    Reminder.calendar_id == payload.calendar_id,
                    Reminder.due_date == due_date,
                    Reminder.deleted_at.is_(None),
                )
            )
            day_order = int(maximum if maximum is not None else -1) + 1
        item = Reminder(
            calendar_id=payload.calendar_id,
            kind=payload.kind,
            text=payload.text,
            due_date=due_date,
            due_at=due_at,
            day_order=day_order,
            completed=payload.completed,
        )
        session.add(item)
        await session.flush()
        await replace_reminder_tags(session, item.id, payload.tag_ids)
        await audit(session, user, "reminder.create", "reminder", item.id)
        items.append(item)
    await session.commit()
    await publish(request, "reminders.created", payload.calendar_id)
    return ReminderCreateResult(items=await reminder_outputs(session, items), warnings=warnings)


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut, tags=["reminders"])
async def update_reminder(
    reminder_id: uuid.UUID,
    payload: ReminderUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
    settings: AppSettings,
) -> ReminderOut:
    reminder = await session.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.deleted_at.is_(None))
    )
    if reminder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reminder not found")
    await require_calendar_access(session, reminder.calendar_id, user.id)
    if reminder.version != payload.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale reminder version")
    target_calendar_id = payload.calendar_id or reminder.calendar_id
    calendar_changed = target_calendar_id != reminder.calendar_id
    original_due_date = reminder.due_date
    if calendar_changed:
        await require_calendar_access(session, target_calendar_id, user.id)
        if payload.tag_ids is None:
            await copy_tags_for_calendar_move(session, reminder.id, target_calendar_id)
        reminder.calendar_id = target_calendar_id
    if payload.text is not None:
        reminder.text = payload.text
    if payload.completed is not None:
        reminder.completed = payload.completed
    if reminder.kind == ReminderKind.DAY and payload.due_at is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "DAY reminder forbids due_at")
    if reminder.kind == ReminderKind.DATETIME and payload.due_date is not None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "DATETIME reminder forbids due_date"
        )
    target_due_date = payload.due_date or reminder.due_date
    if target_due_date is not None and (calendar_changed or target_due_date != original_due_date):
        validate_workday(target_due_date)
        reminder.due_date = target_due_date
        maximum = await session.scalar(
            select(func.max(Reminder.day_order)).where(
                Reminder.calendar_id == target_calendar_id,
                Reminder.due_date == target_due_date,
                Reminder.id != reminder.id,
                Reminder.deleted_at.is_(None),
            )
        )
        reminder.day_order = int(maximum if maximum is not None else -1) + 1
    if payload.due_at is not None:
        reminder.due_at = normalize_due_at(payload.due_at, settings.app_timezone)
    if payload.tag_ids is not None:
        await validate_tag_ids(session, target_calendar_id, payload.tag_ids)
        await replace_reminder_tags(session, reminder.id, payload.tag_ids)
    reminder.version += 1
    await audit(session, user, "reminder.update", "reminder", reminder.id)
    await session.commit()
    await publish(request, "reminder.updated", reminder.id)
    return (await reminder_outputs(session, [reminder]))[0]


@router.delete("/reminders/{reminder_id}", response_model=Message, tags=["reminders"])
async def delete_reminder(
    reminder_id: uuid.UUID,
    version: Annotated[int, Query(ge=1)],
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    reminder = await session.scalar(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.deleted_at.is_(None))
    )
    if reminder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "reminder not found")
    await require_calendar_access(session, reminder.calendar_id, user.id)
    if reminder.version != version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale reminder version")
    reminder.deleted_at = datetime.now(UTC)
    await audit(session, user, "reminder.delete", "reminder", reminder.id)
    await session.commit()
    await publish(request, "reminder.deleted", reminder.id)
    return Message(detail="reminder scheduled for purge")


@router.put("/reminders/day-board", response_model=list[ReminderOut], tags=["reminders"])
async def update_day_board(
    payload: DayBoardUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> list[ReminderOut]:
    seen: set[uuid.UUID] = set()
    changed: list[Reminder] = []
    for column in payload.columns:
        validate_workday(column.date)
        if seen.intersection(column.reminder_ids):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "duplicate reminder in board",
            )
        seen.update(column.reminder_ids)
        reminders = (
            await session.scalars(
                select(Reminder).where(
                    Reminder.id.in_(column.reminder_ids),
                    Reminder.kind == ReminderKind.DAY,
                    Reminder.deleted_at.is_(None),
                )
            )
        ).all()
        if len(reminders) != len(column.reminder_ids):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid DAY reminder")
        by_id = {item.id: item for item in reminders}
        for position, reminder_id in enumerate(column.reminder_ids):
            reminder = by_id[reminder_id]
            await require_calendar_access(session, reminder.calendar_id, user.id)
            if reminder.version != payload.versions[reminder_id]:
                raise HTTPException(status.HTTP_409_CONFLICT, "stale reminder version")
            reminder.due_date = column.date
            reminder.day_order = position
            reminder.version += 1
            changed.append(reminder)
    await audit(session, user, "reminder.day_board", "reminder", "multiple")
    await session.commit()
    await publish(request, "reminders.reordered", "day-board")
    return await reminder_outputs(session, changed)


@router.get("/weeks/{week_start}", response_model=WeekOut, tags=["reminders"])
async def get_week(
    week_start: date,
    session: Session,
    user: CurrentUser,
    settings: AppSettings,
    calendar_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> WeekOut:
    if week_start.weekday() != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "week_start must be Monday")
    end = week_start + timedelta(days=5)
    allowed = accessible_calendars(user.id).subquery()
    conditions = [Reminder.calendar_id.in_(select(allowed.c.id))]
    if calendar_ids:
        conditions.append(Reminder.calendar_id.in_(calendar_ids))
    zone = ZoneInfo(settings.app_timezone)
    start_at = datetime.combine(week_start, datetime.min.time(), zone).astimezone(UTC)
    end_at = datetime.combine(end + timedelta(days=1), datetime.min.time(), zone).astimezone(UTC)
    reminders = (
        await session.scalars(
            select(Reminder)
            .where(
                Reminder.deleted_at.is_(None),
                *conditions,
                or_(
                    and_(Reminder.due_date >= week_start, Reminder.due_date <= end),
                    and_(Reminder.due_at >= start_at, Reminder.due_at < end_at),
                ),
            )
            .order_by(
                Reminder.due_date,
                Reminder.day_order,
                Reminder.due_at,
                Reminder.created_at,
            )
        )
    ).all()
    return WeekOut(
        start=week_start, end=end, reminders=await reminder_outputs(session, list(reminders))
    )


@router.get("/search", response_model=list[ReminderOut], tags=["reminders"])
async def search_reminders(
    session: Session,
    user: CurrentUser,
    text: Annotated[str | None, Query(min_length=1)] = None,
    tag: Annotated[str | None, Query(min_length=1)] = None,
    calendar_id: uuid.UUID | None = None,
) -> list[ReminderOut]:
    allowed = accessible_calendars(user.id).subquery()
    statement = select(Reminder).where(
        Reminder.deleted_at.is_(None), Reminder.calendar_id.in_(select(allowed.c.id))
    )
    if text:
        statement = statement.where(Reminder.text.ilike(f"%{text}%"))
    if calendar_id:
        statement = statement.where(Reminder.calendar_id == calendar_id)
    if tag:
        statement = (
            statement.join(ReminderTag, ReminderTag.reminder_id == Reminder.id)
            .join(Tag, Tag.id == ReminderTag.tag_id)
            .where(Tag.name.ilike(f"%{tag}%"), Tag.deleted_at.is_(None))
        )
    reminders = (
        await session.scalars(
            statement.distinct().order_by(Reminder.due_date, Reminder.due_at, Reminder.created_at)
        )
    ).all()
    return await reminder_outputs(session, list(reminders))


@router.get("/categories", response_model=list[CategoryOut], tags=["floating"])
async def list_categories(session: Session, user: CurrentUser) -> list[FloatingCategory]:
    allowed = accessible_calendars(user.id).subquery()
    categories_used_in_accessible_calendars = select(FloatingTask.category_id).where(
        FloatingTask.deleted_at.is_(None),
        FloatingTask.calendar_id.in_(select(allowed.c.id)),
    )
    return list(
        (
            await session.scalars(
                select(FloatingCategory)
                .where(
                    FloatingCategory.deleted_at.is_(None),
                    or_(
                        FloatingCategory.global_category.is_(True),
                        FloatingCategory.owner_id == user.id,
                        FloatingCategory.id.in_(categories_used_in_accessible_calendars),
                    ),
                )
                .order_by(FloatingCategory.global_category.desc(), FloatingCategory.position)
            )
        ).all()
    )


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    tags=["floating"],
)
async def create_category(
    payload: CategoryCreate, request: Request, session: Session, user: CurrentUser
) -> FloatingCategory:
    maximum = await session.scalar(
        select(func.max(FloatingCategory.position)).where(
            FloatingCategory.owner_id == user.id, FloatingCategory.deleted_at.is_(None)
        )
    )
    category = FloatingCategory(
        id=uuid.uuid4(),
        owner_id=user.id,
        name=payload.name.strip(),
        position=int(maximum if maximum is not None else -1) + 1,
    )
    session.add(category)
    await audit(session, user, "category.create", "category", category.id)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "category already exists") from exc
    await session.refresh(category)
    await publish(request, "category.created", category.id)
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut, tags=["floating"])
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> FloatingCategory:
    category = await session.scalar(
        select(FloatingCategory).where(
            FloatingCategory.id == category_id,
            FloatingCategory.owner_id == user.id,
            FloatingCategory.global_category.is_(False),
            FloatingCategory.deleted_at.is_(None),
        )
    )
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "personal category not found")
    if category.version != payload.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale category version")
    if payload.name is not None:
        category.name = payload.name.strip()
    category.version += 1
    await audit(session, user, "category.update", "category", category.id)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "category already exists") from exc
    await publish(request, "category.updated", category.id)
    return category


@router.put("/categories/order", response_model=list[CategoryOut], tags=["floating"])
async def reorder_categories(
    payload: ReorderRequest,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> list[FloatingCategory]:
    categories = (
        await session.scalars(
            select(FloatingCategory).where(
                FloatingCategory.id.in_(payload.ids),
                FloatingCategory.owner_id == user.id,
                FloatingCategory.deleted_at.is_(None),
            )
        )
    ).all()
    if len(categories) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid category order")
    by_id = {item.id: item for item in categories}
    ordered = [by_id[item_id] for item_id in payload.ids]
    for position, category in enumerate(ordered):
        if category.version != payload.versions[category.id]:
            raise HTTPException(status.HTTP_409_CONFLICT, "stale category version")
        category.position = position
        category.version += 1
    await audit(session, user, "category.reorder", "category", "multiple")
    await session.commit()
    await publish(request, "categories.reordered", user.id)
    return ordered


@router.delete("/categories/{category_id}", response_model=Message, tags=["floating"])
async def delete_category(
    category_id: uuid.UUID,
    version: Annotated[int, Query(ge=1)],
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    category = await session.scalar(
        select(FloatingCategory).where(
            FloatingCategory.id == category_id,
            FloatingCategory.owner_id == user.id,
            FloatingCategory.global_category.is_(False),
            FloatingCategory.deleted_at.is_(None),
        )
    )
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "personal category not found")
    if category.version != version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale category version")
    used = await session.scalar(
        select(FloatingTask.id).where(
            FloatingTask.category_id == category.id, FloatingTask.deleted_at.is_(None)
        )
    )
    if used:
        raise HTTPException(status.HTTP_409_CONFLICT, "category is in use")
    category.deleted_at = datetime.now(UTC)
    await audit(session, user, "category.delete", "category", category.id)
    await session.commit()
    await publish(request, "category.deleted", category.id)
    return Message(detail="category scheduled for purge")


@router.get("/floating-tasks", response_model=list[FloatingTaskOut], tags=["floating"])
async def list_floating_tasks(
    session: Session,
    user: CurrentUser,
    calendar_id: uuid.UUID | None = None,
) -> list[FloatingTask]:
    allowed = accessible_calendars(user.id).subquery()
    statement = select(FloatingTask).where(
        FloatingTask.deleted_at.is_(None),
        FloatingTask.calendar_id.in_(select(allowed.c.id)),
    )
    if calendar_id:
        statement = statement.where(FloatingTask.calendar_id == calendar_id)
    return list(
        (
            await session.scalars(
                statement.order_by(FloatingTask.category_id, FloatingTask.position)
            )
        ).all()
    )


@router.post(
    "/floating-tasks",
    response_model=FloatingTaskOut,
    status_code=status.HTTP_201_CREATED,
    tags=["floating"],
)
async def create_floating_task(
    payload: FloatingTaskCreate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> FloatingTask:
    await require_calendar_access(session, payload.calendar_id, user.id)
    await require_category(session, payload.category_id, user.id)
    maximum = await session.scalar(
        select(func.max(FloatingTask.position)).where(
            FloatingTask.calendar_id == payload.calendar_id,
            FloatingTask.category_id == payload.category_id,
            FloatingTask.deleted_at.is_(None),
        )
    )
    item = FloatingTask(
        id=uuid.uuid4(),
        calendar_id=payload.calendar_id,
        category_id=payload.category_id,
        text=payload.text,
        completed=payload.completed,
        position=int(maximum if maximum is not None else -1) + 1,
    )
    session.add(item)
    await audit(session, user, "floating_task.create", "floating_task", item.id)
    await session.commit()
    await session.refresh(item)
    await publish(request, "floating_task.created", item.id)
    return item


@router.patch("/floating-tasks/{task_id}", response_model=FloatingTaskOut, tags=["floating"])
async def update_floating_task(
    task_id: uuid.UUID,
    payload: FloatingTaskUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> FloatingTask:
    item = await session.scalar(
        select(FloatingTask).where(FloatingTask.id == task_id, FloatingTask.deleted_at.is_(None))
    )
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "floating task not found")
    await require_calendar_access(session, item.calendar_id, user.id)
    if item.version != payload.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale floating task version")
    if payload.category_id is not None:
        await require_category(session, payload.category_id, user.id)
        if payload.category_id != item.category_id:
            maximum = await session.scalar(
                select(func.max(FloatingTask.position)).where(
                    FloatingTask.calendar_id == item.calendar_id,
                    FloatingTask.category_id == payload.category_id,
                    FloatingTask.deleted_at.is_(None),
                )
            )
            item.category_id = payload.category_id
            item.position = int(maximum if maximum is not None else -1) + 1
    if payload.text is not None:
        item.text = payload.text
    if payload.completed is not None:
        item.completed = payload.completed
    item.version += 1
    await audit(session, user, "floating_task.update", "floating_task", item.id)
    await session.commit()
    await publish(request, "floating_task.updated", item.id)
    return item


@router.put("/floating-tasks/order", response_model=list[FloatingTaskOut], tags=["floating"])
async def reorder_floating_tasks(
    payload: ReorderRequest,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> list[FloatingTask]:
    items = (
        await session.scalars(
            select(FloatingTask).where(
                FloatingTask.id.in_(payload.ids), FloatingTask.deleted_at.is_(None)
            )
        )
    ).all()
    if len(items) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "invalid task order")
    by_id = {item.id: item for item in items}
    ordered = [by_id[item_id] for item_id in payload.ids]
    grouping = {(item.calendar_id, item.category_id) for item in ordered}
    if len(grouping) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ordered tasks must share calendar and category",
        )
    for item in ordered:
        await require_calendar_access(session, item.calendar_id, user.id)
        if item.version != payload.versions[item.id]:
            raise HTTPException(status.HTTP_409_CONFLICT, "stale floating task version")
    for position, item in enumerate(ordered):
        item.position = position
        item.version += 1
    await audit(session, user, "floating_task.reorder", "floating_task", "multiple")
    await session.commit()
    await publish(request, "floating_tasks.reordered", "multiple")
    return ordered


@router.delete("/floating-tasks/{task_id}", response_model=Message, tags=["floating"])
async def delete_floating_task(
    task_id: uuid.UUID,
    version: Annotated[int, Query(ge=1)],
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    item = await session.scalar(
        select(FloatingTask).where(FloatingTask.id == task_id, FloatingTask.deleted_at.is_(None))
    )
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "floating task not found")
    await require_calendar_access(session, item.calendar_id, user.id)
    if item.version != version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale floating task version")
    item.deleted_at = datetime.now(UTC)
    await audit(session, user, "floating_task.delete", "floating_task", item.id)
    await session.commit()
    await publish(request, "floating_task.deleted", item.id)
    return Message(detail="floating task scheduled for purge")


@router.get("/notebooks", response_model=list[NotebookOut], tags=["notebooks"])
async def list_notebooks(session: Session, user: CurrentUser) -> list[Notebook]:
    return list(
        (
            await session.scalars(
                select(Notebook)
                .where(Notebook.owner_id == user.id, Notebook.deleted_at.is_(None))
                .order_by(Notebook.position)
            )
        ).all()
    )


@router.post(
    "/notebooks",
    response_model=NotebookOut,
    status_code=status.HTTP_201_CREATED,
    tags=["notebooks"],
)
async def create_notebook(
    payload: NotebookCreate, request: Request, session: Session, user: CurrentUser
) -> Notebook:
    maximum = await session.scalar(
        select(func.max(Notebook.position)).where(
            Notebook.owner_id == user.id, Notebook.deleted_at.is_(None)
        )
    )
    notebook = Notebook(
        id=uuid.uuid4(),
        owner_id=user.id,
        title=payload.title.strip(),
        content="",
        position=int(maximum if maximum is not None else -1) + 1,
    )
    session.add(notebook)
    await audit(session, user, "notebook.create", "notebook", notebook.id)
    await session.commit()
    await session.refresh(notebook)
    await publish(request, "notebook.created", notebook.id)
    return notebook


@router.patch("/notebooks/{notebook_id}", response_model=NotebookOut, tags=["notebooks"])
async def update_notebook(
    notebook_id: uuid.UUID,
    payload: NotebookUpdate,
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Notebook:
    notebook = await session.scalar(
        select(Notebook).where(
            Notebook.id == notebook_id,
            Notebook.owner_id == user.id,
            Notebook.deleted_at.is_(None),
        )
    )
    if notebook is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "notebook not found")
    if notebook.version != payload.version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale notebook version")
    if payload.title is not None:
        notebook.title = payload.title.strip()
    if payload.content is not None:
        notebook.content = payload.content
    notebook.version += 1
    await audit(session, user, "notebook.update", "notebook", notebook.id)
    await session.commit()
    await session.refresh(notebook)
    await publish(request, "notebook.updated", notebook.id)
    return notebook


@router.delete("/notebooks/{notebook_id}", response_model=Message, tags=["notebooks"])
async def delete_notebook(
    notebook_id: uuid.UUID,
    version: Annotated[int, Query(ge=1)],
    request: Request,
    session: Session,
    user: CurrentUser,
) -> Message:
    notebook = await session.scalar(
        select(Notebook).where(
            Notebook.id == notebook_id,
            Notebook.owner_id == user.id,
            Notebook.deleted_at.is_(None),
        )
    )
    if notebook is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "notebook not found")
    if notebook.version != version:
        raise HTTPException(status.HTTP_409_CONFLICT, "stale notebook version")
    notebook.deleted_at = datetime.now(UTC)
    await audit(session, user, "notebook.delete", "notebook", notebook.id)
    await session.commit()
    await publish(request, "notebook.deleted", notebook.id)
    return Message(detail="notebook scheduled for purge")


@router.get("/months/{year_month}", response_model=MonthOut, tags=["reminders"])
async def get_month(
    year_month: str,
    session: Session,
    user: CurrentUser,
    settings: AppSettings,
    calendar_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> MonthOut:
    try:
        year, month = int(year_month[:4]), int(year_month[5:7])
        if len(year_month) != 7 or year_month[4] != "-" or not (1 <= month <= 12):
            raise ValueError
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "year_month must be YYYY-MM"
        ) from exc
    month_start = date(year, month, 1)
    next_month = date(year + (month // 12), (month % 12) + 1, 1)
    allowed = accessible_calendars(user.id).subquery()
    conditions = [Reminder.calendar_id.in_(select(allowed.c.id))]
    if calendar_ids:
        conditions.append(Reminder.calendar_id.in_(calendar_ids))
    zone = ZoneInfo(settings.app_timezone)
    start_at = datetime.combine(month_start, datetime.min.time(), zone).astimezone(UTC)
    end_at = datetime.combine(next_month, datetime.min.time(), zone).astimezone(UTC)
    reminders = (
        await session.scalars(
            select(Reminder)
            .where(
                Reminder.deleted_at.is_(None),
                *conditions,
                or_(
                    and_(Reminder.due_date >= month_start, Reminder.due_date < next_month),
                    and_(Reminder.due_at >= start_at, Reminder.due_at < end_at),
                ),
            )
            .order_by(
                Reminder.due_date,
                Reminder.day_order,
                Reminder.due_at,
                Reminder.created_at,
            )
        )
    ).all()
    return MonthOut(
        year=year,
        month=month,
        reminders=await reminder_outputs(session, list(reminders)),
    )


@router.get("/week-notes/{week_start}", response_model=WeekNoteOut, tags=["week-notes"])
async def get_week_note(
    week_start: date,
    session: Session,
    user: CurrentUser,
) -> WeekNoteOut:
    if week_start.weekday() != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "week_start must be Monday")
    note = await session.scalar(
        select(WeekNote).where(
            WeekNote.owner_id == user.id, WeekNote.week_start == week_start
        )
    )
    return WeekNoteOut(week_start=week_start, content=note.content if note else "")


@router.put("/week-notes/{week_start}", response_model=WeekNoteOut, tags=["week-notes"])
async def upsert_week_note(
    week_start: date,
    payload: WeekNoteIn,
    session: Session,
    user: CurrentUser,
) -> WeekNoteOut:
    if week_start.weekday() != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "week_start must be Monday")
    note = await session.scalar(
        select(WeekNote).where(
            WeekNote.owner_id == user.id, WeekNote.week_start == week_start
        )
    )
    if note is None:
        note = WeekNote(
            id=uuid.uuid4(),
            owner_id=user.id,
            week_start=week_start,
            content=payload.content,
        )
        session.add(note)
    else:
        note.content = payload.content
    await session.commit()
    await session.refresh(note)
    return WeekNoteOut(week_start=note.week_start, content=note.content)


@router.get("/events", tags=["events"])
async def events(request: Request, _user: CurrentUser) -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        async for payload in broker(request).subscribe():
            envelope = json.loads(payload)
            yield f"data: {json.dumps(envelope['event'], separators=(',', ':'))}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
