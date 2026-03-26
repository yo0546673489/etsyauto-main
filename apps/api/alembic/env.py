"""Alembic environment — loads DATABASE_URL from app settings."""
from __future__ import annotations

import os
import sys

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

# apps/api as cwd when running `alembic -c alembic.ini` from apps/api
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings  # noqa: E402

config = context.config
target_metadata = None


def run_migrations_online() -> None:
    connectable = create_engine(settings.DATABASE_URL, poolclass=NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
