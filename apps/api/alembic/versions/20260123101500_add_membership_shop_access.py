"""
Add allowed_shop_ids to memberships for per-shop access control

Revision ID: add_membership_shop_access
Revises: 20260122193000_add_etsy_product_fields
Create Date: 2026-01-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "add_membership_shop_access"
down_revision = "add_etsy_product_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "memberships",
        sa.Column("allowed_shop_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column("memberships", "allowed_shop_ids")
