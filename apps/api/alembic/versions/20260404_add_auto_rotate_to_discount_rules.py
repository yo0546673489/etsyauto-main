"""add auto_rotate columns to discount_rules

Revision ID: 20260404_auto_rotate
Revises: ec1e8d4b1e8e
Create Date: 2026-04-04
"""
from alembic import op
import sqlalchemy as sa

revision = '20260404_auto_rotate'
down_revision = 'ec1e8d4b1e8e'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('discount_rules', sa.Column('auto_rotate', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('discount_rules', sa.Column('auto_min_percent', sa.Float(), nullable=True))
    op.add_column('discount_rules', sa.Column('auto_max_percent', sa.Float(), nullable=True))
    op.add_column('discount_rules', sa.Column('auto_interval_days', sa.Integer(), nullable=True))
    op.add_column('discount_rules', sa.Column('last_rotated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('discount_rules', 'last_rotated_at')
    op.drop_column('discount_rules', 'auto_interval_days')
    op.drop_column('discount_rules', 'auto_max_percent')
    op.drop_column('discount_rules', 'auto_min_percent')
    op.drop_column('discount_rules', 'auto_rotate')
