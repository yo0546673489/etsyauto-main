"""
Migration Utilities for Idempotent Schema Changes
Ensures migrations can be run multiple times safely
"""
import logging
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.engine import reflection

logger = logging.getLogger(__name__)


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table"""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def table_exists(table_name: str) -> bool:
    """Check if a table exists"""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists"""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = [idx['name'] for idx in inspector.get_indexes(table_name)]
    return index_name in indexes


def constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a constraint exists"""
    bind = op.get_bind()
    inspector = inspect(bind)

    # Check foreign keys
    fks = inspector.get_foreign_keys(table_name)
    if any(fk.get('name') == constraint_name for fk in fks):
        return True

    # Check unique constraints
    ucs = inspector.get_unique_constraints(table_name)
    if any(uc.get('name') == constraint_name for uc in ucs):
        return True

    # Check check constraints
    ccs = inspector.get_check_constraints(table_name)
    if any(cc.get('name') == constraint_name for cc in ccs):
        return True

    return False


def add_column_if_not_exists(table_name: str, column):
    """Add a column only if it doesn't exist"""
    if not column_exists(table_name, column.name):
        op.add_column(table_name, column)
        logger.info(f"Added column {column.name} to {table_name}")
    else:
        logger.info(f"Column {column.name} already exists in {table_name}, skipping")


def create_table_if_not_exists(table_name: str, *args, **kwargs):
    """Create a table only if it doesn't exist"""
    if not table_exists(table_name):
        op.create_table(table_name, *args, **kwargs)
        logger.info(f"Created table {table_name}")
    else:
        logger.info(f"Table {table_name} already exists, skipping")


def drop_column_if_exists(table_name: str, column_name: str):
    """Drop a column only if it exists"""
    if column_exists(table_name, column_name):
        op.drop_column(table_name, column_name)
        logger.info(f"Dropped column {column_name} from {table_name}")
    else:
        logger.info(f"Column {column_name} doesn't exist in {table_name}, skipping")
