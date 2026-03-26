"""add tenant onboarding fields

Revision ID: tenant_onboarding_001
Revises: 2f8a3c4d9e5b
Create Date: 2025-12-02 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sys
import os

# Add parent directory to path to import migration_utils
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from app.db.migration_utils import add_column_if_not_exists, drop_column_if_exists


# revision identifiers, used by Alembic.
revision = 'tenant_onboarding_001'
down_revision = '2f8a3c4d9e5b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add onboarding fields to tenants table (idempotent)"""
    # Add description column to tenants table (only if doesn't exist)
    add_column_if_not_exists(
        'tenants',
        sa.Column('description', sa.Text(), nullable=True)
    )

    # Add onboarding_completed column to tenants table (only if doesn't exist)
    add_column_if_not_exists(
        'tenants',
        sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    """Remove onboarding fields from tenants table (idempotent)"""
    # Remove columns if they exist
    drop_column_if_exists('tenants', 'onboarding_completed')
    drop_column_if_exists('tenants', 'description')

