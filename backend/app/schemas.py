from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Locale, ReminderKind, ShareRole


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(APIModel):
    id: uuid.UUID
    username: str
    active: bool


class CalendarCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = Field(default="#2563EB", pattern=r"^#[0-9A-Fa-f]{6}$")


class CalendarUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class CalendarOut(APIModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    color: str
    text_color: str
    version: int
    is_owner: bool = False


class ShareCreate(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    role: ShareRole = ShareRole.EDITOR


class ShareOut(BaseModel):
    user: UserOut
    role: ShareRole


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagOut(APIModel):
    id: uuid.UUID
    calendar_id: uuid.UUID
    name: str


class ReminderCreate(BaseModel):
    calendar_id: uuid.UUID
    kind: ReminderKind
    text: str = Field(min_length=1, max_length=2000)
    due_date: date | None = None
    due_at: datetime | None = None
    completed: bool = False
    tag_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    weekly_count: int = Field(default=1, ge=1, le=52)

    @model_validator(mode="after")
    def validate_due_shape(self) -> ReminderCreate:
        if self.kind == ReminderKind.DAY and (self.due_date is None or self.due_at is not None):
            raise ValueError("DAY reminders require due_date and forbid due_at")
        if self.kind == ReminderKind.DATETIME and (
            self.due_at is None or self.due_date is not None
        ):
            raise ValueError("DATETIME reminders require due_at and forbid due_date")
        return self


class ReminderUpdate(BaseModel):
    version: int = Field(ge=1)
    calendar_id: uuid.UUID | None = None
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    due_date: date | None = None
    due_at: datetime | None = None
    completed: bool | None = None
    tag_ids: list[uuid.UUID] | None = Field(default=None, max_length=10)


class ReminderOut(APIModel):
    id: uuid.UUID
    calendar_id: uuid.UUID
    kind: ReminderKind
    text: str
    due_date: date | None
    due_at: datetime | None
    day_order: int | None
    completed: bool
    version: int
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime


class ReminderCreateResult(BaseModel):
    items: list[ReminderOut]
    warnings: list[str]


class DayColumn(BaseModel):
    date: date
    reminder_ids: list[uuid.UUID]


class DayBoardUpdate(BaseModel):
    columns: list[DayColumn] = Field(min_length=1, max_length=6)
    versions: dict[uuid.UUID, int]

    @model_validator(mode="after")
    def validate_versions(self) -> DayBoardUpdate:
        reminder_ids = [item for column in self.columns for item in column.reminder_ids]
        if len(reminder_ids) != len(set(reminder_ids)):
            raise ValueError("reminder IDs must be unique")
        if set(reminder_ids) != set(self.versions):
            raise ValueError("versions must match reminder IDs")
        return self


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=100)


class CategoryOut(APIModel):
    id: uuid.UUID
    owner_id: uuid.UUID | None
    name: str
    position: int
    global_category: bool
    version: int


class ReorderRequest(BaseModel):
    ids: list[uuid.UUID]
    versions: dict[uuid.UUID, int]

    @model_validator(mode="after")
    def validate_versions(self) -> ReorderRequest:
        if len(self.ids) != len(set(self.ids)):
            raise ValueError("IDs must be unique")
        if set(self.ids) != set(self.versions):
            raise ValueError("versions must match IDs")
        return self


class FloatingTaskCreate(BaseModel):
    calendar_id: uuid.UUID
    category_id: uuid.UUID
    text: str = Field(min_length=1, max_length=2000)
    completed: bool = False


class FloatingTaskUpdate(BaseModel):
    version: int = Field(ge=1)
    category_id: uuid.UUID | None = None
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    completed: bool | None = None


class FloatingTaskOut(APIModel):
    id: uuid.UUID
    calendar_id: uuid.UUID
    category_id: uuid.UUID
    text: str
    completed: bool
    position: int
    version: int


class PreferenceUpdate(BaseModel):
    selected_calendar_ids: list[uuid.UUID] | None = None
    locale: Locale | None = None


class PreferenceOut(BaseModel):
    selected_calendar_ids: list[uuid.UUID]
    locale: Locale


class WeekOut(BaseModel):
    start: date
    end: date
    reminders: list[ReminderOut]


class Message(BaseModel):
    detail: str


class NotebookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class NotebookUpdate(BaseModel):
    version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None


class NotebookOut(APIModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    content: str
    position: int
    version: int
    created_at: datetime
    updated_at: datetime


class WeekNoteOut(BaseModel):
    week_start: date
    content: str


class WeekNoteIn(BaseModel):
    content: str = Field(default="", max_length=1000)


class MonthOut(BaseModel):
    year: int
    month: int
    reminders: list[ReminderOut]


class ShoppingListOut(BaseModel):
    data: dict[str, str]


class ShoppingListIn(BaseModel):
    data: dict[str, str] = Field(default_factory=dict)
