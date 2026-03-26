"""merge_messaging_into_main

Revision ID: bb038150eb17
Revises: 3c8365ecbe1a, 3d9c5e7f1a2b
Create Date: 2026-03-10 14:05:26.363734

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb038150eb17'
down_revision: Union[str, None] = ('3c8365ecbe1a', '3d9c5e7f1a2b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
