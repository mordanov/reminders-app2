"""Add shopping_lists table.

Revision ID: 20260906_0006
Revises: 20260905_0005
Create Date: 2026-09-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260906_0006"
down_revision: str | None = "20260905_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shopping_lists",
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("owner_id"),
    )


def downgrade() -> None:
    op.drop_table("shopping_lists")
