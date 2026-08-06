"""eval generator_model, drift_flagged, eval_type values

Revision ID: b2a01a05308c
Revises: 5ce6b32d9cad
Create Date: 2026-07-10 15:31:38.638959

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2a01a05308c'
down_revision: Union[str, Sequence[str], None] = '5ce6b32d9cad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # extend eval_type enum with the metrics that lacked a slot
    op.execute("ALTER TYPE eval_type ADD VALUE IF NOT EXISTS 'context_recall'")
    op.execute("ALTER TYPE eval_type ADD VALUE IF NOT EXISTS 'hallucination'")

    op.add_column(
        "eval_results",
        sa.Column("generator_model", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "eval_results",
        sa.Column(
            "drift_flagged", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.create_index(
        "ix_eval_results_generator_model", "eval_results", ["generator_model"]
    )
    op.create_index(
        "ix_eval_results_drift_flagged", "eval_results", ["drift_flagged"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_eval_results_drift_flagged", table_name="eval_results")
    op.drop_index("ix_eval_results_generator_model", table_name="eval_results")
    op.drop_column("eval_results", "drift_flagged")
    op.drop_column("eval_results", "generator_model")
    # NOTE: Postgres cannot easily drop enum values; leaving eval_type values in place.
