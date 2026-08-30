"""Add secure user password hashes.

Revision ID: 20260830_0002
Revises: 20260830_0001
Create Date: 2026-08-30
"""

import os
from collections.abc import Sequence

import bcrypt
import sqlalchemy as sa

from alembic import op

revision: str = "20260830_0002"
down_revision: str | None = "20260830_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("password_hash", sa.String(255), nullable=True))
    disabled_hash = bcrypt.hashpw(os.urandom(32), bcrypt.gensalt()).decode()
    op.execute(
        sa.text("UPDATE users SET password_hash = :password_hash").bindparams(
            password_hash=disabled_hash
        )
    )
    with op.batch_alter_table("users") as batch:
        batch.alter_column("password_hash", existing_type=sa.String(255), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("password_hash")
