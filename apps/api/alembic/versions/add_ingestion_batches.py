"""Add ingestion_batches table

Revision ID: add_ingestion_batches
Revises: 35b9314d451b
Create Date: 2025-12-09 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_ingestion_batches'
down_revision = '35b9314d451b'
branch_labels = None
depends_on = None


def upgrade():
    # Create ingestion_batches table
    op.create_table(
        'ingestion_batches',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=True),
        sa.Column('batch_id', sa.String(length=255), nullable=False),
        sa.Column('filename', sa.String(length=500), nullable=True),
        sa.Column('file_type', sa.String(length=20), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=True, server_default='upload'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('total_rows', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('successful_rows', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('failed_rows', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('error_report_path', sa.String(length=1000), nullable=True),
        sa.Column('error_report_url', sa.String(length=1000), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('raw_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("file_type IN ('csv','json')", name='ingestion_batches_file_type_check'),
        sa.CheckConstraint("status IN ('pending','processing','completed','failed','cancelled')", name='ingestion_batches_status_check')
    )
    
    # Create indexes
    op.create_index(op.f('ix_ingestion_batches_id'), 'ingestion_batches', ['id'], unique=False)
    op.create_index(op.f('ix_ingestion_batches_tenant_id'), 'ingestion_batches', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_ingestion_batches_shop_id'), 'ingestion_batches', ['shop_id'], unique=False)
    op.create_index(op.f('ix_ingestion_batches_batch_id'), 'ingestion_batches', ['batch_id'], unique=True)
    op.create_index(op.f('ix_ingestion_batches_status'), 'ingestion_batches', ['status'], unique=False)
    op.create_index(op.f('ix_ingestion_batches_created_at'), 'ingestion_batches', ['created_at'], unique=False)
    op.create_index('idx_ingestion_batch_tenant_status', 'ingestion_batches', ['tenant_id', 'status'], unique=False)
    op.create_index('idx_ingestion_batch_created', 'ingestion_batches', ['created_at'], unique=False)


def downgrade():
    op.drop_index('idx_ingestion_batch_created', table_name='ingestion_batches')
    op.drop_index('idx_ingestion_batch_tenant_status', table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_created_at'), table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_status'), table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_batch_id'), table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_shop_id'), table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_tenant_id'), table_name='ingestion_batches')
    op.drop_index(op.f('ix_ingestion_batches_id'), table_name='ingestion_batches')
    op.drop_table('ingestion_batches')

