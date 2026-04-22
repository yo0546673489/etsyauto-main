"""Add shop_credentials table

Revision ID: shop_credentials_01
Revises: fix_notifications_bigint
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa


revision = "shop_credentials_01"
down_revision = "fix_notifications_bigint"
branch_label = None
depends_on = None


def upgrade():
    op.create_table(
        "shop_credentials",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=False),
        sa.Column("shop_number", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("former_email", sa.String(length=255), nullable=True),
        sa.Column("password", sa.String(length=255), nullable=True),
        sa.Column("etsy_password", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("credit_card", sa.String(length=100), nullable=True),
        sa.Column("bank", sa.String(length=100), nullable=True),
        sa.Column("proxy", sa.String(length=100), nullable=True),
        sa.Column("ebay", sa.String(length=100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_shop_credentials_tenant_id", "shop_credentials", ["tenant_id"])
    op.create_index("ix_shop_credentials_tenant_shop_number", "shop_credentials", ["tenant_id", "shop_number"])


def downgrade():
    op.drop_index("ix_shop_credentials_tenant_shop_number", table_name="shop_credentials")
    op.drop_index("ix_shop_credentials_tenant_id", table_name="shop_credentials")
    op.drop_table("shop_credentials")
