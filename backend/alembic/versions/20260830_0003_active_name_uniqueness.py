"""Limit name uniqueness to active soft-deletable rows.

Revision ID: 20260830_0003
Revises: 20260830_0002
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260830_0003"
down_revision: str | None = "20260830_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _create_active_index(table: str, name: str, columns: list[str]) -> None:
    op.create_index(
        name,
        table,
        columns,
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
        sqlite_where=sa.text("deleted_at IS NULL"),
    )


def upgrade() -> None:
    for table, constraint in (
        ("calendars", "uq_calendar_owner_name"),
        ("tags", "uq_tag_calendar_name"),
        ("floating_categories", "uq_floating_category_owner_name"),
    ):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(constraint, type_="unique")
    _create_active_index(
        "calendars",
        "uq_calendar_owner_name_active",
        ["owner_id", "name"],
    )
    _create_active_index(
        "tags",
        "uq_tag_calendar_name_active",
        ["calendar_id", "name"],
    )
    _create_active_index(
        "floating_categories",
        "uq_floating_category_owner_name_active",
        ["owner_id", "name"],
    )


def downgrade() -> None:
    for table, index in (
        ("calendars", "uq_calendar_owner_name_active"),
        ("tags", "uq_tag_calendar_name_active"),
        ("floating_categories", "uq_floating_category_owner_name_active"),
    ):
        op.drop_index(index, table_name=table)
    for table, constraint, columns in (
        ("calendars", "uq_calendar_owner_name", ["owner_id", "name"]),
        ("tags", "uq_tag_calendar_name", ["calendar_id", "name"]),
        (
            "floating_categories",
            "uq_floating_category_owner_name",
            ["owner_id", "name"],
        ),
    ):
        with op.batch_alter_table(table) as batch:
            batch.create_unique_constraint(constraint, columns)
