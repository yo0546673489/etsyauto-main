# Database Migration Operations Guide

## Overview

This document outlines enterprise-grade procedures for managing database migrations in the Etsy Automation Platform.

## Architecture

### Migration Stack
- **Alembic**: Database migration tool
- **SQLAlchemy**: ORM and schema definition
- **PostgreSQL**: Production database
- **Idempotent Migrations**: All migrations check for existence before applying changes

### Migration Files Location
```
apps/api/alembic/versions/
```

### Migration Utilities
```
apps/api/app/db/migration_utils.py
```

## Standard Operations

### 1. Creating a New Migration

```bash
# Generate a new migration file
docker compose exec api alembic revision -m "descriptive_name_of_change"

# Edit the generated file to use idempotent helpers
```

**Migration Template:**
```python
"""descriptive name

Revision ID: auto_generated_id
Revises: previous_revision_id
Create Date: timestamp
"""
from alembic import op
import sqlalchemy as sa
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from app.db.migration_utils import (
    add_column_if_not_exists,
    create_table_if_not_exists,
    drop_column_if_exists
)

revision = 'auto_generated_id'
down_revision = 'previous_revision_id'

def upgrade() -> None:
    """Forward migration (idempotent)"""
    add_column_if_not_exists(
        'table_name',
        sa.Column('column_name', sa.Type(), nullable=True)
    )

def downgrade() -> None:
    """Reverse migration (idempotent)"""
    drop_column_if_exists('table_name', 'column_name')
```

### 2. Checking Migration Status

```bash
# View current database version
docker compose -f docker-compose.prod.yml exec api alembic current

# View migration history
docker compose -f docker-compose.prod.yml exec api alembic history

# View pending migrations
docker compose -f docker-compose.prod.yml exec api alembic heads
```

### 3. Applying Migrations (Development)

```bash
# Apply all pending migrations
docker compose exec api alembic upgrade head

# Apply specific migration
docker compose exec api alembic upgrade <revision_id>

# Downgrade one migration
docker compose exec api alembic downgrade -1
```

### 4. Applying Migrations (Production)

**ALWAYS follow this procedure for production:**

```bash
# Step 1: Audit current state
docker compose -f docker-compose.prod.yml exec api python /app/scripts/audit_db_state.py

# Step 2: Backup database
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres etsy_platform > backup_$(date +%Y%m%d_%H%M%S).sql

# Step 3: Pull latest code
git pull origin main

# Step 4: Rebuild API container (includes new migrations)
docker compose -f docker-compose.prod.yml build --no-cache api

# Step 5: Run reconciliation (handles version mismatches)
docker compose -f docker-compose.prod.yml exec api python /app/scripts/reconcile_migrations.py

# Step 6: Verify final state
docker compose -f docker-compose.prod.yml exec api alembic current
docker compose -f docker-compose.prod.yml exec api python /app/scripts/audit_db_state.py

# Step 7: Restart API to load new schema
docker compose -f docker-compose.prod.yml restart api
```

## Troubleshooting

### Problem: "Multiple head revisions"

**Cause:** Migration dependency tree has multiple branches

**Solution:**
```bash
# View the branches
docker compose exec api alembic heads

# Merge the branches by creating a new migration
docker compose exec api alembic merge <rev1> <rev2> -m "merge branches"
```

### Problem: "Table already exists"

**Cause:** Database schema doesn't match alembic_version table

**Solution:**
```bash
# Run the reconciliation script (automatically fixes this)
docker compose -f docker-compose.prod.yml exec api python scripts/reconcile_migrations.py
```

### Problem: Migration fails mid-way

**Cause:** Error in migration code or database constraint

**Solution:**
```bash
# Check the error in logs
docker compose -f docker-compose.prod.yml logs api --tail=100

# If migration is partially applied, manually stamp to that revision
docker compose -f docker-compose.prod.yml exec api alembic stamp <revision_id>

# Fix the migration code to be idempotent
# Re-run the migration
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## Best Practices

### 1. Always Use Idempotent Migrations
- Check if tables/columns exist before creating
- Check if they exist before dropping
- Use the migration_utils helpers

### 2. Test Migrations Locally First
```bash
# Test forward migration
docker compose exec api alembic upgrade head

# Test it's idempotent (run twice)
docker compose exec api alembic upgrade head

# Test backward migration
docker compose exec api alembic downgrade -1

# Test forward again
docker compose exec api alembic upgrade head
```

### 3. Never Edit Applied Migrations
- If a migration has been applied to production, NEVER edit it
- Create a new migration to fix issues
- Keep migration history linear

### 4. Backup Before Production Migrations
```bash
# Always backup before applying migrations
docker compose -f docker-compose.prod.yml exec db pg_dump -U postgres etsy_platform > backup.sql

# If something goes wrong, restore:
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres etsy_platform < backup.sql
```

### 5. Use Transactions
- Most PostgreSQL DDL operations are transactional
- If a migration fails, it rolls back automatically
- For complex migrations, explicitly use transactions

### 6. Monitor Migration Performance
```bash
# Time a migration
time docker compose exec api alembic upgrade head

# For large tables, consider:
# - Running migrations during low-traffic periods
# - Using concurrent index creation
# - Adding columns with defaults in steps
```

## Migration Checklist

Before applying to production:

- [ ] Migration tested in local environment
- [ ] Migration is idempotent (can be run multiple times)
- [ ] Database backup created
- [ ] Migration downgrade tested
- [ ] Code that depends on new schema is deployed
- [ ] Rollback plan documented
- [ ] Team notified of deployment

## Emergency Procedures

### Rollback a Failed Migration

```bash
# If migration fails and database is in bad state:

# 1. Restore from backup
docker compose -f docker-compose.prod.yml exec -T db psql -U postgres etsy_platform < backup.sql

# 2. Verify alembic version
docker compose -f docker-compose.prod.yml exec api alembic current

# 3. Rollback code to previous version
git checkout <previous_commit>
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

### Manual Schema Fix

```bash
# If you need to manually fix schema (last resort):

# 1. Connect to database
docker compose -f docker-compose.prod.yml exec db psql -U postgres etsy_platform

# 2. Apply manual fix
ALTER TABLE table_name ADD COLUMN column_name TYPE;

# 3. Update alembic version to match
docker compose -f docker-compose.prod.yml exec api alembic stamp <revision_id>
```

## Monitoring

### Key Metrics to Monitor
- Migration execution time
- Database size before/after
- Table lock duration
- Application downtime

### Logging
All migrations are logged in the API container logs:
```bash
docker compose -f docker-compose.prod.yml logs api | grep alembic
```

## Support

For migration issues, contact the platform team or consult:
- Alembic documentation: https://alembic.sqlalchemy.org/
- SQLAlchemy documentation: https://www.sqlalchemy.org/
- Internal wiki: [Your wiki link]
