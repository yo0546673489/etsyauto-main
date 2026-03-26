"""merge_all_heads

Revision ID: 3c8365ecbe1a
Revises: 20260223_currency, 20260223_ledger_seed, 20260225_financial_state_cols
Create Date: 2026-03-08 21:19:20.319382

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c8365ecbe1a'
down_revision: Union[str, None] = ('20260223_currency', '20260223_ledger_seed', '20260225_financial_state_cols')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
