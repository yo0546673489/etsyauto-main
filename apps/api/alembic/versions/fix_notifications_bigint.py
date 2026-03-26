"""Fix notifications table - change to bigint

Revision ID: fix_notifications_bigint
Revises: add_oauth_enhancements
Create Date: 2025-12-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fix_notifications_bigint'
down_revision = 'add_oauth_enhancements'  # Follows OAuth enhancements
branch_label = None
depends_on = None


def upgrade():
    # Change id, user_id, tenant_id to bigint
    op.execute('ALTER TABLE notifications ALTER COLUMN id TYPE bigint')
    op.execute('ALTER TABLE notifications ALTER COLUMN user_id TYPE bigint')
    op.execute('ALTER TABLE notifications ALTER COLUMN tenant_id TYPE bigint')


def downgrade():
    # Revert to integer
    op.execute('ALTER TABLE notifications ALTER COLUMN id TYPE integer')
    op.execute('ALTER TABLE notifications ALTER COLUMN user_id TYPE integer')
    op.execute('ALTER TABLE notifications ALTER COLUMN tenant_id TYPE integer')

