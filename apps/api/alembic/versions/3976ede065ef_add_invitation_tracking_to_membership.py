"""add_invitation_tracking_to_membership

Revision ID: 3976ede065ef
Revises: 
Create Date: 2025-11-28 09:08:54.709201

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3976ede065ef'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add invitation tracking columns to memberships table
    op.add_column('memberships', sa.Column('invitation_status', sa.String(20), nullable=False, server_default='accepted'))
    op.add_column('memberships', sa.Column('invitation_token', sa.String(255), nullable=True))
    op.add_column('memberships', sa.Column('invitation_token_expires', sa.DateTime(timezone=True), nullable=True))
    op.add_column('memberships', sa.Column('invited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('memberships', sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True))

    # Add check constraint for invitation_status
    op.create_check_constraint(
        'ck_membership_invitation_status',
        'memberships',
        "invitation_status IN ('pending', 'accepted', 'rejected')"
    )

    # Create index on invitation_token
    op.create_index('ix_memberships_invitation_token', 'memberships', ['invitation_token'], unique=True)


def downgrade() -> None:
    # Remove index
    op.drop_index('ix_memberships_invitation_token', table_name='memberships')

    # Remove check constraint
    op.drop_constraint('ck_membership_invitation_status', 'memberships', type_='check')

    # Remove columns
    op.drop_column('memberships', 'accepted_at')
    op.drop_column('memberships', 'invited_at')
    op.drop_column('memberships', 'invitation_token_expires')
    op.drop_column('memberships', 'invitation_token')
    op.drop_column('memberships', 'invitation_status')
