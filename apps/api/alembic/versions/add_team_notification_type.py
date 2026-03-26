"""Add TEAM to notificationtype enum

Revision ID: add_team_notification_type
Revises: fix_notifications_bigint
Create Date: 2025-12-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_team_notification_type'
down_revision = 'fix_notifications_bigint'
branch_label = None
depends_on = None


def upgrade():
    # Add 'team' to the notificationtype enum
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'team'")


def downgrade():
    # Note: PostgreSQL doesn't support removing enum values easily
    # You would need to recreate the enum type to remove a value
    pass

