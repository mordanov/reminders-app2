from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base


class ReminderKind(enum.StrEnum):
    DAY = "DAY"
    DATETIME = "DATETIME"


class ShareRole(enum.StrEnum):
    EDITOR = "EDITOR"


class Locale(enum.StrEnum):
    RU = "ru"
    EN = "en"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class Calendar(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "calendars"
    __table_args__ = (
        Index(
            "uq_calendar_owner_name_active",
            "owner_id",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        CheckConstraint("length(name) BETWEEN 1 AND 100", name="calendar_name_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(7), default="#2563EB")
    text_color: Mapped[str] = mapped_column(String(7), default="#FFFFFF")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class CalendarMember(Base):
    __tablename__ = "calendar_members"

    calendar_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[ShareRole] = mapped_column(
        Enum(ShareRole, native_enum=False), default=ShareRole.EDITOR
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Tag(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tags"
    __table_args__ = (
        Index(
            "uq_tag_calendar_name_active",
            "calendar_id",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        CheckConstraint("length(name) BETWEEN 1 AND 50", name="tag_name_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))


class Reminder(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "reminders"
    __table_args__ = (
        CheckConstraint("length(text) BETWEEN 1 AND 2000", name="reminder_text_length"),
        CheckConstraint(
            "(kind = 'DAY' AND due_date IS NOT NULL AND due_at IS NULL) OR "
            "(kind = 'DATETIME' AND due_date IS NULL AND due_at IS NOT NULL)",
            name="reminder_due_shape",
        ),
        Index("ix_reminders_calendar_due_date_order", "calendar_id", "due_date", "day_order"),
        Index("ix_reminders_calendar_due_at_created", "calendar_id", "due_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ReminderKind] = mapped_column(Enum(ReminderKind, native_enum=False), index=True)
    text: Mapped[str] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    day_order: Mapped[int | None] = mapped_column(Integer)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class ReminderTag(Base):
    __tablename__ = "reminder_tags"

    reminder_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reminders.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class FloatingCategory(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "floating_categories"
    __table_args__ = (
        Index(
            "uq_floating_category_owner_name_active",
            "owner_id",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
        CheckConstraint("length(name) BETWEEN 1 AND 100", name="category_name_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer, default=0)
    global_category: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class FloatingTask(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "floating_tasks"
    __table_args__ = (
        CheckConstraint("length(text) BETWEEN 1 AND 2000", name="floating_task_text_length"),
        Index(
            "ix_floating_tasks_calendar_category_order", "calendar_id", "category_id", "position"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    calendar_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("floating_categories.id", ondelete="RESTRICT"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    position: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    selected_calendar_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    locale: Mapped[Locale] = mapped_column(
        Enum(
            Locale,
            native_enum=False,
            values_callable=lambda values: [item.value for item in values],
        ),
        default=Locale.RU,
        server_default=Locale.RU.value,
    )


class Notebook(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "notebooks"
    __table_args__ = (
        CheckConstraint("length(title) BETWEEN 1 AND 200", name="notebook_title_length"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, default="", server_default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": version}


class WeekNote(Base, TimestampMixin):
    __tablename__ = "week_notes"
    __table_args__ = (UniqueConstraint("owner_id", "week_start"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", server_default="")


class HabitTracker(Base, TimestampMixin):
    __tablename__ = "habit_trackers"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    habits: Mapped[list[Any]] = mapped_column(JSON, default=list, server_default="[]")
    completions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")


class ShoppingList(Base, TimestampMixin):
    __tablename__ = "shopping_lists"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    data: Mapped[dict[str, str]] = mapped_column(JSON, default=dict, server_default="{}")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict[str, object]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
