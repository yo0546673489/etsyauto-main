"""add_oauth_providers_table

Revision ID: 2f8a3c4d9e5b
Revises: 1bea0bd9a72b
Create Date: 2025-12-02 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '2f8a3c4d9e5b'
down_revision = '1bea0bd9a72b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create oauth_providers table
    op.create_table(
        'oauth_providers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('provider_user_id', sa.Text(), nullable=False),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('picture', sa.Text(), nullable=True),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index('idx_oauth_providers_user_id', 'oauth_providers', ['user_id'])
    op.create_index('idx_oauth_providers_provider_user_id', 'oauth_providers', ['provider', 'provider_user_id'], unique=True)
    op.create_index('idx_oauth_providers_email', 'oauth_providers', ['email'])

    # Add foreign key constraint to users table
    op.create_foreign_key(
        'fk_oauth_providers_user_id',
        'oauth_providers', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # Drop foreign key
    op.drop_constraint('fk_oauth_providers_user_id', 'oauth_providers', type_='foreignkey')

    # Drop indexes
    op.drop_index('idx_oauth_providers_email', 'oauth_providers')
    op.drop_index('idx_oauth_providers_provider_user_id', 'oauth_providers')
    op.drop_index('idx_oauth_providers_user_id', 'oauth_providers')

    # Drop table
    op.drop_table('oauth_providers')
