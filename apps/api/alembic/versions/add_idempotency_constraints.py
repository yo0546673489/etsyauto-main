"""
Add Idempotency and Data Integrity Constraints
Revision ID: idempotency_constraints
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'idempotency_constraints'
down_revision = 'f9713cb3c87f'
branch_labels = None
depends_on = None


def upgrade():
    """Add constraints for data integrity and idempotency"""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def has_table(table_name: str) -> bool:
        return bind.execute(sa.text("SELECT to_regclass(:name)"), {"name": table_name}).scalar() is not None

    def has_column(table_name: str, column_name: str) -> bool:
        if not has_table(table_name):
            return False
        return column_name in {col["name"] for col in inspector.get_columns(table_name)}

    def has_unique_constraint(table_name: str, constraint_name: str) -> bool:
        if not has_table(table_name):
            return False
        return constraint_name in {c["name"] for c in inspector.get_unique_constraints(table_name)}

    def has_index(table_name: str, index_name: str) -> bool:
        if not has_table(table_name):
            return False
        return index_name in {i["name"] for i in inspector.get_indexes(table_name)}

    # ===== Product Ingestion Idempotency =====
    # Ensure batch_id + row_index is unique (prevent duplicate ingestion)
    # Only apply if the row_index column exists (some schemas don't include it).
    if has_column("ingestion_batches", "row_index") and not has_unique_constraint("ingestion_batches", "uq_ingestion_batch_row"):
        op.create_unique_constraint(
            'uq_ingestion_batch_row',
            'ingestion_batches',
            ['batch_id', 'row_index']
        )
    
    # Add idempotency_key to ingestion batches
    if not has_column("ingestion_batches", "idempotency_key"):
        op.add_column(
            'ingestion_batches',
            sa.Column('idempotency_key', sa.String(255), nullable=True)
        )
    if has_table("ingestion_batches") and not has_index("ingestion_batches", "ix_ingestion_batches_idempotency_key"):
        op.create_index(
            'ix_ingestion_batches_idempotency_key',
            'ingestion_batches',
            ['idempotency_key']
        )
    
    # ===== Listing Publication Idempotency =====
    # Ensure shop_id + product_id + idempotency_key is unique
    if not has_column("listing_jobs", "idempotency_key"):
        op.add_column(
            'listing_jobs',
            sa.Column('idempotency_key', sa.String(255), nullable=True)
        )
    if (
        has_column("listing_jobs", "shop_id")
        and has_column("listing_jobs", "product_id")
        and has_column("listing_jobs", "idempotency_key")
        and not has_unique_constraint("listing_jobs", "uq_listing_job_idempotency")
    ):
        op.create_unique_constraint(
            'uq_listing_job_idempotency',
            'listing_jobs',
            ['shop_id', 'product_id', 'idempotency_key']
        )
    
    # ===== Product Uniqueness =====
    # Ensure SKU is unique per tenant + shop
    if (
        has_column("products", "tenant_id")
        and has_column("products", "shop_id")
        and has_column("products", "sku")
        and not has_unique_constraint("products", "uq_product_tenant_shop_sku")
    ):
        op.create_unique_constraint(
            'uq_product_tenant_shop_sku',
            'products',
            ['tenant_id', 'shop_id', 'sku']
        )
    
    # ===== OAuth Token Uniqueness =====
    # Ensure only one active token per tenant + shop
    if (
        has_column("oauth_tokens", "tenant_id")
        and has_column("oauth_tokens", "shop_id")
        and not has_unique_constraint("oauth_tokens", "uq_oauth_token_tenant_shop")
    ):
        op.create_unique_constraint(
            'uq_oauth_token_tenant_shop',
            'oauth_tokens',
            ['tenant_id', 'shop_id']
        )
    
    # ===== API Key Uniqueness =====
    # key_hash already has unique constraint, add index for performance
    if has_table("api_keys") and not has_index("api_keys", "ix_api_keys_key_hash"):
        op.create_index(
            'ix_api_keys_key_hash',
            'api_keys',
            ['key_hash']
        )
    
    # ===== Schedule Uniqueness =====
    # Prevent duplicate schedules for same shop
    if not has_column("schedules", "schedule_hash"):
        op.add_column(
            'schedules',
            sa.Column('schedule_hash', sa.String(64), nullable=True)
        )
    if has_table("schedules") and not has_index("schedules", "ix_schedules_schedule_hash"):
        op.create_index(
            'ix_schedules_schedule_hash',
            'schedules',
            ['schedule_hash']
        )
    
    # ===== AI Generation Deduplication =====
    # Ensure we don't generate twice for same product + version
    if (
        has_column("ai_generations", "product_id")
        and has_column("ai_generations", "generation_version")
        and not has_unique_constraint("ai_generations", "uq_ai_generation_product_version")
    ):
        op.create_unique_constraint(
            'uq_ai_generation_product_version',
            'ai_generations',
            ['product_id', 'generation_version']
        )
    
    # ===== Order Sync Idempotency =====
    # Ensure external order ID is unique per shop
    if (
        has_column("orders", "shop_id")
        and has_column("orders", "external_order_id")
        and not has_unique_constraint("orders", "uq_order_shop_external_id")
    ):
        op.create_unique_constraint(
            'uq_order_shop_external_id',
            'orders',
            ['shop_id', 'external_order_id']
        )
    
    # ===== Audit Log Deduplication =====
    # Add composite index for deduplication
    if has_table("audit_logs") and not has_index("audit_logs", "ix_audit_logs_dedup"):
        op.create_index(
            'ix_audit_logs_dedup',
            'audit_logs',
            ['request_id', 'action', 'tenant_id']
        )


def downgrade():
    """Remove idempotency constraints"""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    def has_table(table_name: str) -> bool:
        return bind.execute(sa.text("SELECT to_regclass(:name)"), {"name": table_name}).scalar() is not None

    def has_column(table_name: str, column_name: str) -> bool:
        if not has_table(table_name):
            return False
        return column_name in {col["name"] for col in inspector.get_columns(table_name)}

    def has_unique_constraint(table_name: str, constraint_name: str) -> bool:
        if not has_table(table_name):
            return False
        return constraint_name in {c["name"] for c in inspector.get_unique_constraints(table_name)}

    def has_index(table_name: str, index_name: str) -> bool:
        if not has_table(table_name):
            return False
        return index_name in {i["name"] for i in inspector.get_indexes(table_name)}

    # Drop constraints in reverse order
    if has_index("audit_logs", "ix_audit_logs_dedup"):
        op.drop_index('ix_audit_logs_dedup', table_name='audit_logs')
    if has_unique_constraint("orders", "uq_order_shop_external_id"):
        op.drop_constraint('uq_order_shop_external_id', 'orders', type_='unique')
    if has_unique_constraint("ai_generations", "uq_ai_generation_product_version"):
        op.drop_constraint('uq_ai_generation_product_version', 'ai_generations', type_='unique')
    if has_index("schedules", "ix_schedules_schedule_hash"):
        op.drop_index('ix_schedules_schedule_hash', table_name='schedules')
    if has_column("schedules", "schedule_hash"):
        op.drop_column('schedules', 'schedule_hash')
    if has_index("api_keys", "ix_api_keys_key_hash"):
        op.drop_index('ix_api_keys_key_hash', table_name='api_keys')
    if has_unique_constraint("oauth_tokens", "uq_oauth_token_tenant_shop"):
        op.drop_constraint('uq_oauth_token_tenant_shop', 'oauth_tokens', type_='unique')
    if has_unique_constraint("products", "uq_product_tenant_shop_sku"):
        op.drop_constraint('uq_product_tenant_shop_sku', 'products', type_='unique')
    if has_unique_constraint("listing_jobs", "uq_listing_job_idempotency"):
        op.drop_constraint('uq_listing_job_idempotency', 'listing_jobs', type_='unique')
    if has_column("listing_jobs", "idempotency_key"):
        op.drop_column('listing_jobs', 'idempotency_key')
    if has_index("ingestion_batches", "ix_ingestion_batches_idempotency_key"):
        op.drop_index('ix_ingestion_batches_idempotency_key', table_name='ingestion_batches')
    if has_column("ingestion_batches", "idempotency_key"):
        op.drop_column('ingestion_batches', 'idempotency_key')
    # Only drop if it exists (row_index may not be present)
    if has_column("ingestion_batches", "row_index") and has_unique_constraint("ingestion_batches", "uq_ingestion_batch_row"):
        op.drop_constraint('uq_ingestion_batch_row', 'ingestion_batches', type_='unique')

