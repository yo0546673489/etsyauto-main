"""Fix FK column types (Integer->BigInteger) and add ondelete CASCADE/SET NULL

Revision ID: c4f8a1d2e3b7
Revises: a3eb3862bf17
Create Date: 2026-02-11

This migration addresses:
1. Integer->BigInteger type fixes for FK columns in error_reports and api_keys
2. Adding ondelete CASCADE or SET NULL to all foreign key constraints
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c4f8a1d2e3b7'
down_revision = 'a3eb3862bf17'
branch_labels = None
depends_on = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _recreate_fk(table, col, ref_table, ref_col, on_delete, col_type=None,
                 nullable=None, fk_name=None):
    """
    Drop old FK, optionally alter column type, then create new FK with ondelete.

    PostgreSQL requires dropping the FK constraint before altering the column
    type, then re-adding it.  We use naming_convention to derive constraint
    names when *fk_name* is not supplied.
    """
    # Derive conventional FK name: fk_<table>_<col>_<ref_table>
    constraint = fk_name or f"fk_{table}_{col}_{ref_table}"

    # Try to drop with conventional name first; if it doesn't exist, try
    # the auto-generated SQLAlchemy name pattern.
    op.execute(f"""
        DO $$
        BEGIN
            -- Try conventional name
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = '{table}'
                  AND constraint_name = '{constraint}'
            ) THEN
                ALTER TABLE {table} DROP CONSTRAINT {constraint};
            ELSE
                -- Try SQLAlchemy auto-generated name: {table}_{col}_fkey
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE table_name = '{table}'
                      AND constraint_name = '{table}_{col}_fkey'
                ) THEN
                    ALTER TABLE {table} DROP CONSTRAINT {table}_{col}_fkey;
                END IF;
            END IF;
        END $$;
    """)

    # Alter column type if requested
    if col_type is not None:
        op.alter_column(table, col, type_=col_type, existing_nullable=nullable)

    # Re-create FK with ondelete
    op.create_foreign_key(
        constraint,
        table, ref_table,
        [col], [ref_col],
        ondelete=on_delete,
    )


def upgrade() -> None:
    # ──────────────────────────────────────────────────────────────────────
    # 1. Fix Integer → BigInteger column types (HIGH-4)
    # ──────────────────────────────────────────────────────────────────────

    # error_reports.tenant_id  Integer → BigInteger + CASCADE
    _recreate_fk('error_reports', 'tenant_id', 'tenants', 'id',
                 on_delete='CASCADE', col_type=sa.BigInteger(), nullable=False)

    # error_reports.shop_id  Integer → BigInteger + SET NULL
    _recreate_fk('error_reports', 'shop_id', 'shops', 'id',
                 on_delete='SET NULL', col_type=sa.BigInteger(), nullable=True)

    # error_reports.user_id  Integer → BigInteger + SET NULL
    _recreate_fk('error_reports', 'user_id', 'users', 'id',
                 on_delete='SET NULL', col_type=sa.BigInteger(), nullable=True)

    # api_keys.tenant_id  Integer → BigInteger + SET NULL
    _recreate_fk('api_keys', 'tenant_id', 'tenants', 'id',
                 on_delete='SET NULL', col_type=sa.BigInteger(), nullable=True)

    # ──────────────────────────────────────────────────────────────────────
    # 2. Add ondelete to existing FKs (HIGH-7)
    #    Grouped by table. Only columns that previously lacked ondelete.
    # ──────────────────────────────────────────────────────────────────────

    # -- memberships --
    _recreate_fk('memberships', 'user_id', 'users', 'id', on_delete='CASCADE')
    _recreate_fk('memberships', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')

    # -- supplier_profiles --
    _recreate_fk('supplier_profiles', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')
    _recreate_fk('supplier_profiles', 'user_id', 'users', 'id', on_delete='CASCADE')
    _recreate_fk('supplier_profiles', 'shop_id', 'shops', 'id', on_delete='SET NULL')

    # -- shops --
    _recreate_fk('shops', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')

    # -- oauth_tokens --
    _recreate_fk('oauth_tokens', 'shop_id', 'shops', 'id', on_delete='CASCADE')
    _recreate_fk('oauth_tokens', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')

    # -- products --
    _recreate_fk('products', 'shop_id', 'shops', 'id', on_delete='SET NULL')

    # -- ai_generations --
    _recreate_fk('ai_generations', 'product_id', 'products', 'id', on_delete='CASCADE')
    _recreate_fk('ai_generations', 'reviewed_by', 'users', 'id', on_delete='SET NULL')

    # -- listing_jobs --
    _recreate_fk('listing_jobs', 'shop_id', 'shops', 'id', on_delete='CASCADE')
    _recreate_fk('listing_jobs', 'product_id', 'products', 'id', on_delete='CASCADE')
    _recreate_fk('listing_jobs', 'ai_generation_id', 'ai_generations', 'id', on_delete='SET NULL')

    # -- schedules --
    _recreate_fk('schedules', 'shop_id', 'shops', 'id', on_delete='SET NULL')

    # -- orders --
    _recreate_fk('orders', 'shop_id', 'shops', 'id', on_delete='CASCADE')
    _recreate_fk('orders', 'supplier_user_id', 'users', 'id', on_delete='SET NULL')

    # -- shipment_events --
    _recreate_fk('shipment_events', 'order_id', 'orders', 'id', on_delete='CASCADE')
    _recreate_fk('shipment_events', 'shop_id', 'shops', 'id', on_delete='CASCADE')
    _recreate_fk('shipment_events', 'actor_user_id', 'users', 'id', on_delete='SET NULL')

    # -- audit_logs --
    _recreate_fk('audit_logs', 'actor_user_id', 'users', 'id', on_delete='SET NULL')
    _recreate_fk('audit_logs', 'tenant_id', 'tenants', 'id', on_delete='SET NULL')
    _recreate_fk('audit_logs', 'shop_id', 'shops', 'id', on_delete='SET NULL')

    # -- ingestion_batches --
    _recreate_fk('ingestion_batches', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')
    _recreate_fk('ingestion_batches', 'shop_id', 'shops', 'id', on_delete='SET NULL')

    # -- notifications --
    _recreate_fk('notifications', 'user_id', 'users', 'id', on_delete='CASCADE')
    _recreate_fk('notifications', 'tenant_id', 'tenants', 'id', on_delete='CASCADE')

    # -- api_keys.replaced_by_id (self-referential) --
    _recreate_fk('api_keys', 'replaced_by_id', 'api_keys', 'id', on_delete='SET NULL')


def downgrade() -> None:
    """
    Downgrade removes ondelete from all FKs added above and reverts
    BigInteger columns back to Integer where changed.

    NOTE: This downgrade is best-effort. In production, prefer forward
    migrations rather than rolling back cascade rules.
    """
    # Revert error_reports type changes (BigInteger → Integer)
    _recreate_fk('error_reports', 'tenant_id', 'tenants', 'id',
                 on_delete='RESTRICT', col_type=sa.Integer(), nullable=False)
    _recreate_fk('error_reports', 'shop_id', 'shops', 'id',
                 on_delete='RESTRICT', col_type=sa.Integer(), nullable=True)
    _recreate_fk('error_reports', 'user_id', 'users', 'id',
                 on_delete='RESTRICT', col_type=sa.Integer(), nullable=True)

    # Revert api_keys type change
    _recreate_fk('api_keys', 'tenant_id', 'tenants', 'id',
                 on_delete='RESTRICT', col_type=sa.Integer(), nullable=True)

    # For all other FKs, simply drop and re-create without ondelete
    # (PostgreSQL default is RESTRICT / NO ACTION)
    tables_fks = [
        ('memberships', 'user_id', 'users', 'id'),
        ('memberships', 'tenant_id', 'tenants', 'id'),
        ('supplier_profiles', 'tenant_id', 'tenants', 'id'),
        ('supplier_profiles', 'user_id', 'users', 'id'),
        ('supplier_profiles', 'shop_id', 'shops', 'id'),
        ('shops', 'tenant_id', 'tenants', 'id'),
        ('oauth_tokens', 'shop_id', 'shops', 'id'),
        ('oauth_tokens', 'tenant_id', 'tenants', 'id'),
        ('products', 'shop_id', 'shops', 'id'),
        ('ai_generations', 'product_id', 'products', 'id'),
        ('ai_generations', 'reviewed_by', 'users', 'id'),
        ('listing_jobs', 'shop_id', 'shops', 'id'),
        ('listing_jobs', 'product_id', 'products', 'id'),
        ('listing_jobs', 'ai_generation_id', 'ai_generations', 'id'),
        ('schedules', 'shop_id', 'shops', 'id'),
        ('orders', 'shop_id', 'shops', 'id'),
        ('orders', 'supplier_user_id', 'users', 'id'),
        ('shipment_events', 'order_id', 'orders', 'id'),
        ('shipment_events', 'shop_id', 'shops', 'id'),
        ('shipment_events', 'actor_user_id', 'users', 'id'),
        ('audit_logs', 'actor_user_id', 'users', 'id'),
        ('audit_logs', 'tenant_id', 'tenants', 'id'),
        ('audit_logs', 'shop_id', 'shops', 'id'),
        ('ingestion_batches', 'tenant_id', 'tenants', 'id'),
        ('ingestion_batches', 'shop_id', 'shops', 'id'),
        ('notifications', 'user_id', 'users', 'id'),
        ('notifications', 'tenant_id', 'tenants', 'id'),
        ('api_keys', 'replaced_by_id', 'api_keys', 'id'),
    ]
    for table, col, ref_table, ref_col in tables_fks:
        _recreate_fk(table, col, ref_table, ref_col, on_delete='RESTRICT')
