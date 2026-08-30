from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any

from sqlalchemy import select

from app import api
from app.config import Settings
from app.models import User
from app.schemas import (
    CalendarCreate,
    CalendarUpdate,
    CategoryCreate,
    CategoryUpdate,
    DayBoardUpdate,
    DayColumn,
    FloatingTaskCreate,
    FloatingTaskUpdate,
    PreferenceUpdate,
    ReminderCreate,
    ReminderUpdate,
    ReorderRequest,
    ShareCreate,
    TagCreate,
)


class RecordingBroker:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    async def publish(self, event: dict[str, object]) -> None:
        self.events.append(event)


def request_with_broker() -> Any:
    app = SimpleNamespace(state=SimpleNamespace(broker=RecordingBroker()))
    return SimpleNamespace(app=app)


async def test_direct_calendar_preference_share_and_tag_api(session_factory) -> None:
    request = request_with_broker()
    async with session_factory() as session:
        alice = await session.scalar(select(User).where(User.username == "alice"))
        bob = await session.scalar(select(User).where(User.username == "bob"))

        preferences = await api.get_preferences(session, alice)
        assert preferences.selected_calendar_ids == []
        preferences = await api.update_preferences(
            PreferenceUpdate(locale="en"), request, session, alice
        )
        assert preferences.locale == "en"

        calendar = await api.create_calendar(
            CalendarCreate(name="Direct", color="#FFFFFF"), request, session, alice
        )
        assert calendar.is_owner
        assert len(await api.list_calendars(session, alice)) == 1
        calendar = await api.update_calendar(
            calendar.id,
            CalendarUpdate(version=calendar.version, name="Direct renamed"),
            request,
            session,
            alice,
        )
        share = await api.add_share(
            calendar.id, ShareCreate(username=bob.username), request, session, alice
        )
        assert share.user.id == bob.id
        assert len(await api.list_shares(calendar.id, session, alice)) == 1
        await api.remove_share(calendar.id, bob.id, request, session, alice)

        tag = await api.create_tag(
            calendar.id, TagCreate(name="direct-tag"), request, session, alice
        )
        assert len(await api.list_tags(calendar.id, session, alice)) == 1
        await api.delete_tag(tag.id, request, session, alice)
        await api.delete_calendar(calendar.id, calendar.version, request, session, alice)
        recreated = await api.create_calendar(
            CalendarCreate(name="Direct renamed"),
            request,
            session,
            alice,
        )
        assert recreated.name == "Direct renamed"


async def test_direct_reminder_and_floating_api(session_factory) -> None:
    request = request_with_broker()
    settings = Settings(database_url="sqlite+aiosqlite://", app_timezone="Europe/Madrid")
    async with session_factory() as session:
        alice = await session.scalar(select(User).where(User.username == "alice"))
        calendar = await api.create_calendar(
            CalendarCreate(name="Content"), request, session, alice
        )
        created = await api.create_reminders(
            ReminderCreate(
                calendar_id=calendar.id,
                kind="DAY",
                text="direct reminder",
                due_date=date(2026, 8, 24),
                weekly_count=2,
            ),
            request,
            session,
            alice,
            settings,
        )
        first = created.items[0]
        changed = await api.update_reminder(
            first.id,
            ReminderUpdate(
                version=first.version,
                completed=True,
                due_date=date(2026, 8, 24),
            ),
            request,
            session,
            alice,
            settings,
        )
        assert changed.day_order == first.day_order
        board = await api.update_day_board(
            DayBoardUpdate(
                columns=[
                    DayColumn(
                        date=date(2026, 8, 25),
                        reminder_ids=[changed.id],
                    )
                ],
                versions={changed.id: changed.version},
            ),
            request,
            session,
            alice,
        )
        assert board[0].due_date == date(2026, 8, 25)
        week = await api.get_week(
            date(2026, 8, 24), session, alice, settings, calendar_ids=[calendar.id]
        )
        assert len(week.reminders) == 1
        found = await api.search_reminders(
            session, alice, text="direct", tag=None, calendar_id=calendar.id
        )
        assert len(found) == 2
        await api.delete_reminder(
            board[0].id,
            board[0].version,
            request,
            session,
            alice,
        )

        category = await api.create_category(
            CategoryCreate(name="Direct category"), request, session, alice
        )
        category = await api.update_category(
            category.id,
            CategoryUpdate(version=category.version, name="Renamed category"),
            request,
            session,
            alice,
        )
        reordered_categories = await api.reorder_categories(
            ReorderRequest(ids=[category.id], versions={category.id: category.version}),
            request,
            session,
            alice,
        )
        category = reordered_categories[0]
        assert len(await api.list_categories(session, alice)) == 2

        task = await api.create_floating_task(
            FloatingTaskCreate(
                calendar_id=calendar.id,
                category_id=category.id,
                text="direct floating task",
            ),
            request,
            session,
            alice,
        )
        task = await api.update_floating_task(
            task.id,
            FloatingTaskUpdate(version=task.version, completed=True),
            request,
            session,
            alice,
        )
        assert len(await api.list_floating_tasks(session, alice, calendar.id)) == 1
        reordered_tasks = await api.reorder_floating_tasks(
            ReorderRequest(ids=[task.id], versions={task.id: task.version}),
            request,
            session,
            alice,
        )
        task = reordered_tasks[0]
        await api.delete_floating_task(task.id, task.version, request, session, alice)
        await api.delete_category(category.id, category.version, request, session, alice)
