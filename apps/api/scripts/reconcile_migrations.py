#!/usr/bin/env python3
"""
Migration Reconciliation Script
Properly reconciles Alembic version table with actual database state

This script:
1. Audits current database state
2. Identifies which migrations have actually been applied
3. Updates alembic_version table to reflect reality
4. Safely applies any pending migrations
"""
import os
import sys
from sqlalchemy import create_engine, inspect, text
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic import command


def check_table_exists(inspector, table_name):
    """Check if a table exists"""
    return table_name in inspector.get_table_names()


def check_column_exists(inspector, table_name, column_name):
    """Check if a column exists in a table"""
    if not check_table_exists(inspector, table_name):
        return False
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns


def detect_applied_migrations(inspector):
    """
    Detect which migrations have been applied by checking database schema
    Returns the latest revision that should be in alembic_version
    """
    applied_migrations = []

    # Check 3976ede065ef - add_invitation_tracking_to_membership
    if check_column_exists(inspector, 'memberships', 'invitation_status'):
        applied_migrations.append('3976ede065ef')

    # Check 1bea0bd9a72b - add_profile_picture_to_users
    if check_column_exists(inspector, 'users', 'profile_picture_url'):
        applied_migrations.append('1bea0bd9a72b')

    # Check 2f8a3c4d9e5b - add_oauth_providers_table
    if check_table_exists(inspector, 'oauth_providers'):
        applied_migrations.append('2f8a3c4d9e5b')

    # Check tenant_onboarding_001 - add_tenant_onboarding_fields
    if check_column_exists(inspector, 'tenants', 'description') and \
       check_column_exists(inspector, 'tenants', 'onboarding_completed'):
        applied_migrations.append('tenant_onboarding_001')

    return applied_migrations


def reconcile_migrations():
    """Main reconciliation function"""

    print("=" * 80)
    print("MIGRATION RECONCILIATION")
    print("=" * 80)

    # Connect to database
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_engine(database_url)
    inspector = inspect(engine)

    # Step 1: Check current alembic version
    print("\n[1] Checking current Alembic version...")
    with engine.connect() as conn:
        try:
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            current_version = result.scalar()
            print(f"    Current version in database: {current_version}")
        except Exception as e:
            print(f"    ERROR: Could not read alembic_version table: {e}")
            current_version = None

    # Step 2: Detect actually applied migrations
    print("\n[2] Detecting applied migrations from schema...")
    applied = detect_applied_migrations(inspector)
    print(f"    Detected migrations: {applied}")

    # Step 3: Determine correct revision
    print("\n[3] Determining correct revision...")

    # Migration order:
    # 3976ede065ef -> 1bea0bd9a72b -> 2f8a3c4d9e5b -> tenant_onboarding_001

    if 'tenant_onboarding_001' in applied:
        correct_revision = 'tenant_onboarding_001'
    elif '2f8a3c4d9e5b' in applied:
        correct_revision = '2f8a3c4d9e5b'
    elif '1bea0bd9a72b' in applied:
        correct_revision = '1bea0bd9a72b'
    elif '3976ede065ef' in applied:
        correct_revision = '3976ede065ef'
    else:
        # No migrations applied, start from base
        correct_revision = None

    print(f"    Correct revision should be: {correct_revision}")

    # Step 4: Update alembic_version if needed
    if current_version != correct_revision:
        print(f"\n[4] Updating alembic_version from {current_version} to {correct_revision}...")

        alembic_cfg = Config("alembic.ini")

        if correct_revision:
            # Stamp to the correct revision
            command.stamp(alembic_cfg, correct_revision)
            print(f"    ✓ Database stamped to revision {correct_revision}")
        else:
            print("    WARNING: No migrations detected, database may need initialization")
    else:
        print("\n[4] Alembic version is correct, no update needed")

    # Step 5: Apply any pending migrations
    print("\n[5] Checking for pending migrations...")
    alembic_cfg = Config("alembic.ini")

    try:
        # This will apply any migrations newer than current_revision
        command.upgrade(alembic_cfg, "head")
        print("    ✓ All migrations applied successfully")
    except Exception as e:
        print(f"    ERROR applying migrations: {e}")
        print("    You may need to resolve conflicts manually")

    # Step 6: Final verification
    print("\n[6] Final verification...")
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        final_version = result.scalar()
        print(f"    Final database version: {final_version}")

    # Verify critical schema
    print("\n[7] Verifying critical schema...")
    errors = []

    if not check_table_exists(inspector, 'tenants'):
        errors.append("  ✗ tenants table missing")
    else:
        if not check_column_exists(inspector, 'tenants', 'description'):
            errors.append("  ✗ tenants.description column missing")
        if not check_column_exists(inspector, 'tenants', 'onboarding_completed'):
            errors.append("  ✗ tenants.onboarding_completed column missing")

    if not check_table_exists(inspector, 'oauth_providers'):
        errors.append("  ✗ oauth_providers table missing")

    if not check_table_exists(inspector, 'users'):
        errors.append("  ✗ users table missing")
    elif not check_column_exists(inspector, 'users', 'profile_picture_url'):
        errors.append("  ✗ users.profile_picture_url column missing")

    if errors:
        print("    Schema validation FAILED:")
        for error in errors:
            print(error)
    else:
        print("    ✓ Schema validation PASSED")

    print("\n" + "=" * 80)
    print("RECONCILIATION COMPLETE")
    print("=" * 80)

    return len(errors) == 0


if __name__ == "__main__":
    success = reconcile_migrations()
    sys.exit(0 if success else 1)
