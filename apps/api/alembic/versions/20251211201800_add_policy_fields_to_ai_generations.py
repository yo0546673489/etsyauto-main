"""Add policy fields to ai_generations

Revision ID: 20251211201800
Revises: add_ingestion_batches
Create Date: 2025-12-11 20:18:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251211201800'
down_revision = 'add_ingestion_batches'
branch_labels = None
depends_on = None


def upgrade():
    # Check and add policy compliance fields (skip if exists)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_columns = [col['name'] for col in inspector.get_columns('ai_generations')]
    
    if 'policy_status' not in existing_columns:
        op.add_column('ai_generations', sa.Column('policy_status', sa.String(20), nullable=True, server_default='passed'))
    if 'policy_flags' not in existing_columns:
        op.add_column('ai_generations', sa.Column('policy_flags', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    if 'policy_checked_at' not in existing_columns:
        op.add_column('ai_generations', sa.Column('policy_checked_at', sa.DateTime(timezone=True), nullable=True))
    
    # Add review workflow fields
    if 'reviewed_by' not in existing_columns:
        op.add_column('ai_generations', sa.Column('reviewed_by', sa.BigInteger(), nullable=True))
    if 'reviewed_at' not in existing_columns:
        op.add_column('ai_generations', sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
    if 'review_decision' not in existing_columns:
        op.add_column('ai_generations', sa.Column('review_decision', sa.String(20), nullable=True))
    
    # Add provider info fields
    if 'provider' not in existing_columns:
        op.add_column('ai_generations', sa.Column('provider', sa.String(20), nullable=True, server_default='openai'))
    if 'tokens_used' not in existing_columns:
        op.add_column('ai_generations', sa.Column('tokens_used', sa.Integer(), nullable=True))
    if 'generation_time_ms' not in existing_columns:
        op.add_column('ai_generations', sa.Column('generation_time_ms', sa.Integer(), nullable=True))
    
    # Add foreign key for reviewed_by if column was added
    if 'reviewed_by' not in existing_columns:
        op.create_foreign_key('fk_ai_generations_reviewed_by', 'ai_generations', 'users', ['reviewed_by'], ['id'])
    
    # Add check constraints (skip if exists)
    try:
        op.create_check_constraint(
            'ck_ai_generations_policy_status',
            'ai_generations',
            "policy_status IN ('passed','failed','needs_review','warning')"
        )
    except Exception:
        pass  # Constraint might already exist
    
    try:
        op.create_check_constraint(
            'ck_ai_generations_review_decision',
            'ai_generations',
            "review_decision IN ('accepted','rejected','modified')"
        )
    except Exception:
        pass
    
    # Create indexes (skip if exists)
    try:
        op.create_index('idx_ai_generations_policy_status', 'ai_generations', ['policy_status'])
    except Exception:
        pass
    try:
        op.create_index('idx_ai_generations_review_decision', 'ai_generations', ['review_decision'])
    except Exception:
        pass


def downgrade():
    # Drop indexes
    op.drop_index('idx_ai_generations_review_decision', table_name='ai_generations')
    op.drop_index('idx_ai_generations_policy_status', table_name='ai_generations')
    
    # Drop check constraints
    op.drop_constraint('ck_ai_generations_review_decision', 'ai_generations', type_='check')
    op.drop_constraint('ck_ai_generations_policy_status', 'ai_generations', type_='check')
    
    # Drop foreign key
    op.drop_constraint('fk_ai_generations_reviewed_by', 'ai_generations', type_='foreignkey')
    
    # Drop columns
    op.drop_column('ai_generations', 'generation_time_ms')
    op.drop_column('ai_generations', 'tokens_used')
    op.drop_column('ai_generations', 'provider')
    op.drop_column('ai_generations', 'review_decision')
    op.drop_column('ai_generations', 'reviewed_at')
    op.drop_column('ai_generations', 'reviewed_by')
    op.drop_column('ai_generations', 'policy_checked_at')
    op.drop_column('ai_generations', 'policy_flags')
    op.drop_column('ai_generations', 'policy_status')

