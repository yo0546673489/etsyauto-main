#!/usr/bin/env python3
"""
Wipe all user data from the database.
Deletes all users, tenants, memberships, shops, and all related data.

Usage:
    python scripts/wipe_all_user_data.py
    python scripts/wipe_all_user_data.py --yes   # skip confirmation

Uses DATABASE_URL from env. For local Docker: DB is on localhost:5433.
Load .env from project root so DB_PASSWORD is available.
"""
import os
import sys
from pathlib import Path

# Project root = etsy-automation-platform (parent of apps/api)
_project_root = Path(__file__).resolve().parent.parent.parent
_env_file = _project_root / ".env"
if _env_file.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_file)
    except ImportError:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings

# For local Docker: DATABASE_URL uses "db" host; scripts run on host → use localhost:5433
_raw = os.getenv("DATABASE_URL") or settings.DATABASE_URL
if "@db:" in _raw or "db:5432" in _raw:
    pw = os.getenv("DB_PASSWORD", "postgres")
    DATABASE_URL = f"postgresql://postgres:{pw}@localhost:5433/etsy_platform"
else:
    DATABASE_URL = _raw


def main():
    if "--yes" not in sys.argv and "-y" not in sys.argv:
        confirm = input("This will DELETE ALL users, tenants, and related data. Type 'yes' to confirm: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            sys.exit(1)

    print("Wiping all user data...")
    engine = create_engine(DATABASE_URL)

    # PostgreSQL: TRUNCATE root tables with CASCADE to clear all dependent data.
    # users and tenants are the roots; CASCADE truncates memberships, shops,
    # oauth_tokens, notifications, products, orders, etc.
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE users, tenants RESTART IDENTITY CASCADE"))
        conn.commit()

    print("Done. All users, tenants, and related data have been deleted.")


if __name__ == "__main__":
    main()
