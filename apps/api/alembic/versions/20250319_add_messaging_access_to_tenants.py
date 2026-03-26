"""add messaging_access column to tenants

Revision ID: 20250319_add_messaging_access
Revises: bb038150eb17
Create Date: 2025-03-19

"""
from alembic import op

revision = "20250319_add_messaging_access"
down_revision = "bb038150eb17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS messaging_access TEXT
  CHECK (messaging_access IN ('none', 'pending', 'approved', 'denied'))
  DEFAULT 'none';
"""
    )


def downgrade() -> None:
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS messaging_access;")
