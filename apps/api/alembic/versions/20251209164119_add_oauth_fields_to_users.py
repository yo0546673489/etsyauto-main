"""add oauth fields to users

Revision ID: 20251209164119
Revises: add_team_notification_type
Create Date: 2025-12-09 16:41:19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251209164119'
down_revision: Union[str, None] = 'add_team_notification_type'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add OAuth fields to users table"""
    # Add OAuth provider field
    op.add_column('users', sa.Column('oauth_provider', sa.String(length=50), nullable=True))
    
    # Add OAuth provider user ID field
    op.add_column('users', sa.Column('oauth_provider_user_id', sa.Text(), nullable=True))
    
    # Add OAuth metadata field
    op.add_column('users', sa.Column('oauth_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    # Create index for faster OAuth lookups
    op.create_index('ix_users_oauth_provider_user_id', 'users', ['oauth_provider', 'oauth_provider_user_id'], unique=False)


def downgrade() -> None:
    """Remove OAuth fields from users table"""
    op.drop_index('ix_users_oauth_provider_user_id', table_name='users')
    op.drop_column('users', 'oauth_data')
    op.drop_column('users', 'oauth_provider_user_id')
    op.drop_column('users', 'oauth_provider')

