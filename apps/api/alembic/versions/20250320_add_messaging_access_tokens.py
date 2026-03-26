"""create messaging_access_tokens table

Revision ID: 20250320_messaging_access_tokens
Revises: 20250319_add_messaging_access
Create Date: 2025-03-20

"""
from alembic import op

revision = "20250320_messaging_access_tokens"
down_revision = "20250319_add_messaging_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
CREATE TABLE IF NOT EXISTS messaging_access_tokens (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messaging_tokens_token ON messaging_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_messaging_tokens_tenant ON messaging_access_tokens(tenant_id);
"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS messaging_access_tokens;")
