"""Initial reminders schema.

Revision ID: 20260830_0001
Revises:
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260830_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column[object]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "calendars",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("text_color", sa.String(7), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 100", name="ck_calendars_calendar_name_length"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], ondelete="RESTRICT", name="fk_calendars_owner_id_users"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_calendars"),
        sa.UniqueConstraint("owner_id", "name", name="uq_calendar_owner_name"),
    )
    op.create_index("ix_calendars_owner_id", "calendars", ["owner_id"])
    op.create_index("ix_calendars_deleted_at", "calendars", ["deleted_at"])

    op.create_table(
        "calendar_members",
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.Enum("EDITOR", name="sharerole", native_enum=False), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            ondelete="CASCADE",
            name="fk_calendar_members_calendar_id_calendars",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE", name="fk_calendar_members_user_id_users"
        ),
        sa.PrimaryKeyConstraint("calendar_id", "user_id", name="pk_calendar_members"),
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint("length(name) BETWEEN 1 AND 50", name="ck_tags_tag_name_length"),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            ondelete="CASCADE",
            name="fk_tags_calendar_id_calendars",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tags"),
        sa.UniqueConstraint("calendar_id", "name", name="uq_tag_calendar_name"),
    )
    op.create_index("ix_tags_calendar_id", "tags", ["calendar_id"])
    op.create_index("ix_tags_deleted_at", "tags", ["deleted_at"])

    op.create_table(
        "reminders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("DAY", "DATETIME", name="reminderkind", native_enum=False),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date()),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("day_order", sa.Integer()),
        sa.Column("completed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "length(text) BETWEEN 1 AND 2000", name="ck_reminders_reminder_text_length"
        ),
        sa.CheckConstraint(
            "(kind = 'DAY' AND due_date IS NOT NULL AND due_at IS NULL) OR "
            "(kind = 'DATETIME' AND due_date IS NULL AND due_at IS NOT NULL)",
            name="ck_reminders_reminder_due_shape",
        ),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            ondelete="CASCADE",
            name="fk_reminders_calendar_id_calendars",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_reminders"),
    )
    op.create_index("ix_reminders_calendar_id", "reminders", ["calendar_id"])
    op.create_index("ix_reminders_kind", "reminders", ["kind"])
    op.create_index("ix_reminders_deleted_at", "reminders", ["deleted_at"])
    op.create_index(
        "ix_reminders_calendar_due_date_order",
        "reminders",
        ["calendar_id", "due_date", "day_order"],
    )
    op.create_index(
        "ix_reminders_calendar_due_at_created", "reminders", ["calendar_id", "due_at", "created_at"]
    )

    op.create_table(
        "reminder_tags",
        sa.Column("reminder_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["reminder_id"],
            ["reminders.id"],
            ondelete="CASCADE",
            name="fk_reminder_tags_reminder_id_reminders",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], ondelete="CASCADE", name="fk_reminder_tags_tag_id_tags"
        ),
        sa.PrimaryKeyConstraint("reminder_id", "tag_id", name="pk_reminder_tags"),
    )

    op.create_table(
        "floating_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid()),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("global_category", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 100", name="ck_floating_categories_category_name_length"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            ondelete="CASCADE",
            name="fk_floating_categories_owner_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_floating_categories"),
        sa.UniqueConstraint("owner_id", "name", name="uq_floating_category_owner_name"),
    )
    op.create_index("ix_floating_categories_owner_id", "floating_categories", ["owner_id"])
    op.create_index("ix_floating_categories_deleted_at", "floating_categories", ["deleted_at"])

    op.create_table(
        "floating_tasks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("completed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *timestamps(),
        sa.CheckConstraint(
            "length(text) BETWEEN 1 AND 2000", name="ck_floating_tasks_floating_task_text_length"
        ),
        sa.ForeignKeyConstraint(
            ["calendar_id"],
            ["calendars.id"],
            ondelete="CASCADE",
            name="fk_floating_tasks_calendar_id_calendars",
        ),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["floating_categories.id"],
            ondelete="RESTRICT",
            name="fk_floating_tasks_category_id_floating_categories",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_floating_tasks"),
    )
    op.create_index("ix_floating_tasks_calendar_id", "floating_tasks", ["calendar_id"])
    op.create_index("ix_floating_tasks_category_id", "floating_tasks", ["category_id"])
    op.create_index("ix_floating_tasks_deleted_at", "floating_tasks", ["deleted_at"])
    op.create_index(
        "ix_floating_tasks_calendar_category_order",
        "floating_tasks",
        ["calendar_id", "category_id", "position"],
    )

    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("selected_calendar_ids", sa.JSON(), nullable=False),
        sa.Column(
            "locale",
            sa.Enum("ru", "en", name="locale", native_enum=False),
            server_default="ru",
            nullable=False,
        ),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE", name="fk_user_preferences_user_id_users"
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_preferences"),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_user_id", sa.Uuid()),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="SET NULL",
            name="fk_audit_log_actor_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
    )
    op.create_index("ix_audit_log_actor_user_id", "audit_log", ["actor_user_id"])
    op.create_index("ix_audit_log_action", "audit_log", ["action"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])


def downgrade() -> None:
    for table in (
        "audit_log",
        "user_preferences",
        "floating_tasks",
        "floating_categories",
        "reminder_tags",
        "reminders",
        "tags",
        "calendar_members",
        "calendars",
        "users",
    ):
        op.drop_table(table)
