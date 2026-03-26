#!/usr/bin/env python3
"""
One-off migration: Add has_auth_error column to financial_sync_status table.
Run with: docker compose exec api python -m app.scripts.add_has_auth_error_column
"""
from sqlalchemy import text
from app.core.database import engine


def main():
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE financial_sync_status
            ADD COLUMN IF NOT EXISTS has_auth_error BOOLEAN DEFAULT FALSE;
        """))
        conn.commit()
    print("Added has_auth_error column to financial_sync_status (or already existed).")


if __name__ == "__main__":
    main()
