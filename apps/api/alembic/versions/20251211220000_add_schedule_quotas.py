"""Add schedule quotas and tracking

Revision ID: 20251211220000
Revises: 20251211201800
Create Date: 2025-12-11 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251211220000'
down_revision = '20251211201800'
branch_labels = None
depends_on = None


def upgrade():
    # Add new quota columns to schedules table
    op.add_column('schedules', sa.Column('daily_quota', sa.Integer(), nullable=False, server_default='150'))
    op.add_column('schedules', sa.Column('weekly_quota', sa.Integer(), nullable=True))
    op.add_column('schedules', sa.Column('daily_used', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('schedules', sa.Column('weekly_used', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('schedules', sa.Column('last_daily_reset', sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.add_column('schedules', sa.Column('last_weekly_reset', sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.add_column('schedules', sa.Column('error_message', sa.Text(), nullable=True))
    op.add_column('schedules', sa.Column('error_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('schedules', sa.Column('total_published', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('schedules', sa.Column('total_failed', sa.Integer(), nullable=False, server_default='0'))
    
    # Update status constraint to include new statuses
    op.execute("ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check")
    op.create_check_constraint(
        'schedules_status_check',
        'schedules',
        "status IN ('active','paused','completed','error','quota_exceeded')"
    )
    
    # Add indexes for better query performance
    op.create_index('idx_schedules_next_run_enabled', 'schedules', ['next_run', 'enabled'])
    op.create_index('idx_schedules_shop_status', 'schedules', ['shop_id', 'status'])
    op.create_index('idx_schedules_tenant_id', 'schedules', ['tenant_id'])
    op.create_index('idx_schedules_enabled', 'schedules', ['enabled'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_schedules_enabled', table_name='schedules')
    op.drop_index('idx_schedules_tenant_id', table_name='schedules')
    op.drop_index('idx_schedules_shop_status', table_name='schedules')
    op.drop_index('idx_schedules_next_run_enabled', table_name='schedules')
    
    # Drop check constraint
    op.drop_constraint('schedules_status_check', 'schedules', type_='check')
    
    # Restore old constraint
    op.create_check_constraint(
        'schedules_status_check',
        'schedules',
        "status IN ('active','paused','completed','error')"
    )
    
    # Drop columns
    op.drop_column('schedules', 'total_failed')
    op.drop_column('schedules', 'total_published')
    op.drop_column('schedules', 'error_count')
    op.drop_column('schedules', 'error_message')
    op.drop_column('schedules', 'last_weekly_reset')
    op.drop_column('schedules', 'last_daily_reset')
    op.drop_column('schedules', 'weekly_used')
    op.drop_column('schedules', 'daily_used')
    op.drop_column('schedules', 'weekly_quota')
    op.drop_column('schedules', 'daily_quota')

