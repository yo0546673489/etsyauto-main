"""Add OAuth enhancements: tenant_id, refresh tracking, indexes

Revision ID: add_oauth_enhancements
Revises: 
Create Date: 2025-12-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_oauth_enhancements'
down_revision = 'tenant_onboarding_001'  # Points to the current head
branch_label = None
depends_on = None


def upgrade():
    # Add new columns to oauth_tokens table
    op.add_column('oauth_tokens', sa.Column('tenant_id', sa.BigInteger(), nullable=True))
    op.add_column('oauth_tokens', sa.Column('scopes', sa.Text(), nullable=True))
    op.add_column('oauth_tokens', sa.Column('last_refreshed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('oauth_tokens', sa.Column('refresh_count', sa.Integer(), server_default='0', nullable=False))
    
    # Populate tenant_id from shops table
    op.execute("""
        UPDATE oauth_tokens 
        SET tenant_id = shops.tenant_id 
        FROM shops 
        WHERE oauth_tokens.shop_id = shops.id
    """)
    
    # Make tenant_id non-nullable after population
    op.alter_column('oauth_tokens', 'tenant_id', nullable=False)
    
    # Add foreign key constraint for tenant_id
    op.create_foreign_key(
        'fk_oauth_tokens_tenant_id',
        'oauth_tokens',
        'tenants',
        ['tenant_id'],
        ['id']
    )
    
    # Create indexes for performance
    op.create_index(
        'idx_oauth_tokens_tenant_shop',
        'oauth_tokens',
        ['tenant_id', 'shop_id']
    )
    op.create_index(
        'idx_oauth_tokens_expires_at',
        'oauth_tokens',
        ['expires_at']
    )


def downgrade():
    # Drop indexes
    op.drop_index('idx_oauth_tokens_expires_at', table_name='oauth_tokens')
    op.drop_index('idx_oauth_tokens_tenant_shop', table_name='oauth_tokens')
    
    # Drop foreign key
    op.drop_constraint('fk_oauth_tokens_tenant_id', 'oauth_tokens', type_='foreignkey')
    
    # Drop columns
    op.drop_column('oauth_tokens', 'refresh_count')
    op.drop_column('oauth_tokens', 'last_refreshed_at')
    op.drop_column('oauth_tokens', 'scopes')
    op.drop_column('oauth_tokens', 'tenant_id')

