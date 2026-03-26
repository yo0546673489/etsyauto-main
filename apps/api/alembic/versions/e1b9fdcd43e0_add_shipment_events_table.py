"""add_shipment_events_table

Revision ID: e1b9fdcd43e0
Revises: 20260205_remove_printful_supplier
Create Date: 2026-02-10 11:14:44.610185

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'e1b9fdcd43e0'
down_revision = '20260205_remove_printful_supplier'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create shipment_events table
    op.create_table(
        'shipment_events',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('order_id', sa.BigInteger(), nullable=False),
        sa.Column('tenant_id', sa.BigInteger(), nullable=False),
        sa.Column('shop_id', sa.BigInteger(), nullable=False),
        sa.Column('state', sa.String(length=20), nullable=False),
        sa.Column('previous_state', sa.String(length=20), nullable=True),
        sa.Column('tracking_code', sa.String(length=255), nullable=True),
        sa.Column('carrier_name', sa.String(length=100), nullable=True),
        sa.Column('tracking_url', sa.String(length=500), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('actor_user_id', sa.BigInteger(), nullable=True),
        sa.Column('actor_role', sa.String(length=20), nullable=True),
        sa.Column('event_timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('shipped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('event_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('processing','shipped','in_transit','delivered','delayed','cancelled')", name='shipment_events_state_check'),
        sa.CheckConstraint("source IN ('manual','etsy_sync','auto')", name='shipment_events_source_check'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_shipment_events_order_state', 'shipment_events', ['order_id', 'state'])
    op.create_index('idx_shipment_events_tenant_timestamp', 'shipment_events', ['tenant_id', 'event_timestamp'])
    op.create_index('idx_shipment_events_state_timestamp', 'shipment_events', ['state', 'event_timestamp'])
    op.create_index(op.f('ix_shipment_events_id'), 'shipment_events', ['id'])
    op.create_index(op.f('ix_shipment_events_order_id'), 'shipment_events', ['order_id'])
    op.create_index(op.f('ix_shipment_events_tenant_id'), 'shipment_events', ['tenant_id'])
    op.create_index(op.f('ix_shipment_events_state'), 'shipment_events', ['state'])
    op.create_index(op.f('ix_shipment_events_source'), 'shipment_events', ['source'])
    op.create_index(op.f('ix_shipment_events_actor_user_id'), 'shipment_events', ['actor_user_id'])
    op.create_index(op.f('ix_shipment_events_tracking_code'), 'shipment_events', ['tracking_code'])
    op.create_index(op.f('ix_shipment_events_event_timestamp'), 'shipment_events', ['event_timestamp'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_shipment_events_event_timestamp'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_tracking_code'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_actor_user_id'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_source'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_state'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_tenant_id'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_order_id'), table_name='shipment_events')
    op.drop_index(op.f('ix_shipment_events_id'), table_name='shipment_events')
    op.drop_index('idx_shipment_events_state_timestamp', table_name='shipment_events')
    op.drop_index('idx_shipment_events_tenant_timestamp', table_name='shipment_events')
    op.drop_index('idx_shipment_events_order_state', table_name='shipment_events')
    
    # Drop table
    op.drop_table('shipment_events')
