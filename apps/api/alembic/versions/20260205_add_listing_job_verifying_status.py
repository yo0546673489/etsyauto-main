"""Add verifying status to listing_jobs

Revision ID: 20260205_add_listing_job_verifying_status
Revises: a3eb3862bf17
Create Date: 2026-02-05
"""

from alembic import op

revision = "20260205_add_listing_job_verifying_status"
down_revision = "a3eb3862bf17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE listing_jobs DROP CONSTRAINT IF EXISTS listing_jobs_status_check")
    op.execute(
        "ALTER TABLE listing_jobs "
        "ADD CONSTRAINT listing_jobs_status_check "
        "CHECK (status IN ('pending','scheduled','processing','verifying','completed','failed','cancelled','policy_blocked'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE listing_jobs DROP CONSTRAINT IF EXISTS listing_jobs_status_check")
    op.execute(
        "ALTER TABLE listing_jobs "
        "ADD CONSTRAINT listing_jobs_status_check "
        "CHECK (status IN ('pending','scheduled','processing','completed','failed','cancelled','policy_blocked'))"
    )
