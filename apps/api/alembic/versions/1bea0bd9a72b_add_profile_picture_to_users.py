"""add_profile_picture_to_users

Revision ID: 1bea0bd9a72b
Revises: 3976ede065ef
Create Date: 2025-11-28 16:01:37.210703

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1bea0bd9a72b'
down_revision = '3976ede065ef'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add profile_picture_url column to users table
    op.add_column('users', sa.Column('profile_picture_url', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove profile_picture_url column from users table
    op.drop_column('users', 'profile_picture_url')
