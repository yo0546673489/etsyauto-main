"""add_message_threads_and_shop_imap

Revision ID: 3d9c5e7f1a2b
Revises: 2f8a3c4d9e5b
Create Date: 2026-02-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3d9c5e7f1a2b"
down_revision = "2f8a3c4d9e5b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns to shops (IF NOT EXISTS is safe)
    op.execute("ALTER TABLE shops ADD COLUMN IF NOT EXISTS adspower_profile_id TEXT")
    op.execute("ALTER TABLE shops ADD COLUMN IF NOT EXISTS imap_host TEXT")
    op.execute("ALTER TABLE shops ADD COLUMN IF NOT EXISTS imap_email TEXT")
    op.execute("ALTER TABLE shops ADD COLUMN IF NOT EXISTS imap_password_enc BYTEA")

    # Create message_threads table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS message_threads (
            id BIGSERIAL PRIMARY KEY,
            tenant_id BIGINT NOT NULL REFERENCES tenants(id),
            shop_id BIGINT NOT NULL REFERENCES shops(id),
            etsy_conversation_url TEXT NOT NULL,
            customer_name TEXT,
            customer_message TEXT,
            status TEXT NOT NULL DEFAULT 'pending_read'
                CONSTRAINT ck_message_threads_status 
                CHECK (status IN ('pending_read','unread','replied','failed')),
            replied_text TEXT,
            replied_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Create indexes if not exist
    op.execute("CREATE INDEX IF NOT EXISTS idx_message_threads_shop ON message_threads(shop_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_message_threads_tenant_status ON message_threads(tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_message_threads_tenant_status")
    op.execute("DROP INDEX IF EXISTS idx_message_threads_shop")
    op.execute("DROP TABLE IF EXISTS message_threads")
    op.execute("ALTER TABLE shops DROP COLUMN IF EXISTS imap_password_enc")
    op.execute("ALTER TABLE shops DROP COLUMN IF EXISTS imap_email")
    op.execute("ALTER TABLE shops DROP COLUMN IF EXISTS imap_host")
    op.execute("ALTER TABLE shops DROP COLUMN IF EXISTS adspower_profile_id")
