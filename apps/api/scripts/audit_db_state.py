#!/usr/bin/env python3
"""
Database State Audit Script
Compares actual database state with Alembic migration expectations
"""
import logging
import os
import sys
from sqlalchemy import create_engine, inspect, text
from alembic.config import Config
from alembic.script import ScriptDirectory

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)

def audit_database_state():
    """Comprehensive audit of database state vs migrations"""

    # Connect to database
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_engine(database_url)
    inspector = inspect(engine)

    print("=" * 80)
    print("DATABASE STATE AUDIT")
    print("=" * 80)

    # 1. Check Alembic version
    print("\n1. ALEMBIC VERSION STATE")
    print("-" * 80)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        current_version = result.scalar()
        print(f"Current Alembic Revision: {current_version}")

    # 2. List all tables
    print("\n2. EXISTING TABLES")
    print("-" * 80)
    tables = inspector.get_table_names()
    for table in sorted(tables):
        print(f"  ✓ {table}")

    # 3. Check critical tables and columns
    print("\n3. CRITICAL SCHEMA VALIDATION")
    print("-" * 80)

    # Check tenants table
    if 'tenants' in tables:
        print("\ntenants table:")
        columns = inspector.get_columns('tenants')
        column_names = [col['name'] for col in columns]

        required_columns = ['description', 'onboarding_completed']
        for col in required_columns:
            status = "✓" if col in column_names else "✗ MISSING"
            print(f"  {status} {col}")
    else:
        print("  ✗ tenants table MISSING")

    # Check oauth_providers table
    if 'oauth_providers' in tables:
        print("\noauth_providers table:")
        print("  ✓ exists")
    else:
        print("\noauth_providers table:")
        print("  ✗ MISSING")

    # Check users table
    if 'users' in tables:
        print("\nusers table:")
        columns = inspector.get_columns('users')
        column_names = [col['name'] for col in columns]

        required_columns = ['profile_picture_url', 'email_verified', 'verification_token']
        for col in required_columns:
            status = "✓" if col in column_names else "✗ MISSING"
            print(f"  {status} {col}")

    # Check memberships table
    if 'memberships' in tables:
        print("\nmemberships table:")
        columns = inspector.get_columns('memberships')
        column_names = [col['name'] for col in columns]

        required_columns = ['invitation_status', 'invitation_token']
        for col in required_columns:
            status = "✓" if col in column_names else "✗ MISSING"
            print(f"  {status} {col}")

    # 4. Migration files audit
    print("\n4. MIGRATION FILES")
    print("-" * 80)

    alembic_cfg = Config("alembic.ini")
    script_dir = ScriptDirectory.from_config(alembic_cfg)

    print("\nMigration Chain:")
    for revision in script_dir.walk_revisions():
        status = "APPLIED" if revision.revision == current_version else "PENDING"
        print(f"  {revision.revision[:12]} -> {revision.down_revision[:12] if revision.down_revision else 'BASE'}")
        print(f"    Status: {status}")
        print(f"    Description: {revision.doc}")

    print("\n" + "=" * 80)
    print("AUDIT COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    audit_database_state()
