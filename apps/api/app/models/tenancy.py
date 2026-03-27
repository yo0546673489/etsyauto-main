"""
SQLAlchemy Models - Core Tenancy & Authentication
"""
from datetime import datetime
from sqlalchemy import (
    Column, BigInteger, String, Text, Boolean, DateTime, Integer,
    ForeignKey, CheckConstraint, UniqueConstraint, Index, LargeBinary
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, BYTEA

from app.core.database import Base
from app.models.orders import Order


class Tenant(Base):
    """Organization/Company that owns shops"""
    __tablename__ = "tenants"
    
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)  # Shop description (up to ~240 chars recommended)
    onboarding_completed = Column(Boolean, default=False, nullable=False)  # Track if user completed onboarding
    billing_tier = Column(
        String(20), 
        CheckConstraint("billing_tier IN ('starter', 'pro', 'enterprise')"),
        default='starter',
        nullable=False
    )
    status = Column(
        String(20),
        CheckConstraint("status IN ('active', 'suspended')"),
        default='active',
        nullable=False
    )
    messaging_access = Column(
        String(20),
        CheckConstraint(
            "messaging_access IN ('none', 'pending', 'approved', 'denied')"
        ),
        default='none',
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    memberships = relationship("Membership", back_populates="tenant")
    shops = relationship("Shop", back_populates="tenant")
    notifications = relationship("Notification", back_populates="tenant", cascade="all, delete-orphan")
    ingestion_batches = relationship("IngestionBatch", back_populates="tenant", cascade="all, delete-orphan")
    # products = relationship("Product", back_populates="tenant")


class User(Base):
    """Platform users"""
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    email = Column(CITEXT, unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=True)  # Nullable for SSO/OAuth
    name = Column(Text, nullable=True)
    profile_picture_url = Column(Text, nullable=True)  # URL to profile picture
    
    # OAuth fields
    oauth_provider = Column(String(50), nullable=True)  # 'google', 'microsoft', etc.
    oauth_provider_user_id = Column(Text, nullable=True)  # User ID from OAuth provider
    oauth_data = Column(JSONB, nullable=True)  # Additional OAuth metadata

    # Email verification
    email_verified = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(255), unique=True, nullable=True, index=True)
    verification_token_expires = Column(DateTime(timezone=True), nullable=True)

    # Password reset
    reset_token = Column(String(255), unique=True, nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    # Security
    failed_login_attempts = Column(BigInteger, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)

    last_login_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    memberships = relationship("Membership", back_populates="user")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    user_preference = relationship("UserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Membership(Base):
    """User membership in tenants with RBAC"""
    __tablename__ = "memberships"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    role = Column(
        String(20),
        CheckConstraint("role IN ('owner', 'admin', 'viewer', 'supplier')"),
        nullable=False
    )

    # Invitation tracking
    invitation_status = Column(
        String(20),
        CheckConstraint("invitation_status IN ('pending', 'accepted', 'rejected')"),
        default='accepted',  # Existing memberships are already accepted
        nullable=False
    )
    invitation_token = Column(String(255), unique=True, nullable=True, index=True)
    invitation_token_expires = Column(DateTime(timezone=True), nullable=True)
    invited_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    # Order read tracking (per-tenant)
    last_orders_viewed_at = Column(DateTime(timezone=True), nullable=True)

    # Per-shop access for viewer/supplier roles (empty = no access)
    allowed_shop_ids = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('user_id', 'tenant_id', name='uq_user_tenant'),
        Index('idx_membership_user', 'user_id'),
        Index('idx_membership_tenant', 'tenant_id'),
    )
    
    # Relationships
    user = relationship("User", back_populates="memberships")
    tenant = relationship("Tenant", back_populates="memberships")


class SupplierProfile(Base):
    """Supplier profile for manual fulfillment"""
    __tablename__ = "supplier_profiles"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="SET NULL"), nullable=True, index=True)

    company_name = Column(Text, nullable=True)
    contact_name = Column(Text, nullable=True)
    email = Column(CITEXT, nullable=True)
    phone = Column(Text, nullable=True)

    address_line1 = Column(Text, nullable=True)
    address_line2 = Column(Text, nullable=True)
    city = Column(Text, nullable=True)
    state = Column(Text, nullable=True)
    postal_code = Column(Text, nullable=True)
    country = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class Shop(Base):
    """Connected Etsy shops"""
    __tablename__ = "shops"
    
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    etsy_shop_id = Column(Text, unique=True, nullable=False, index=True)
    display_name = Column(Text, nullable=True)
    status = Column(
        String(20),
        CheckConstraint("status IN ('connected', 'revoked')"),
        default='connected',
        nullable=False
    )
    
    # Etsy shop configuration
    default_shipping_profile_id = Column(BigInteger, nullable=True)  # Etsy shipping profile ID
    default_return_policy_id = Column(BigInteger, nullable=True)  # Etsy return policy ID
    shop_section_id = Column(BigInteger, nullable=True)  # Default Etsy shop section
    
    # Shop metadata from Etsy
    shop_data = Column(JSONB, nullable=True)  # Store full shop info from Etsy API

    # Messaging automation configuration
    adspower_profile_id = Column(Text, nullable=True)
    imap_host = Column(Text, nullable=True)
    imap_email = Column(Text, nullable=True)
    imap_password_enc = Column(LargeBinary, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="shops")
    oauth_tokens = relationship("OAuthToken", back_populates="shop", cascade="all, delete-orphan")
    ingestion_batches = relationship("IngestionBatch", back_populates="shop", cascade="all, delete-orphan")


class ConnectLink(Base):
    """One-time expiring links for Etsy shop connection"""
    __tablename__ = "connect_links"

    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(128), unique=True, nullable=False, index=True)
    shop_name = Column(Text, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class OAuthToken(Base):
    """Encrypted OAuth tokens for external services"""
    __tablename__ = "oauth_tokens"
    
    id = Column(BigInteger, primary_key=True, index=True, autoincrement=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(BigInteger, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)  # Added for faster queries
    provider = Column(
        String(20),
        CheckConstraint("provider IN ('etsy')"),
        nullable=False
    )
    
    # Encrypted tokens stored as BYTEA
    access_token = Column(BYTEA, nullable=False)  # Encrypted
    refresh_token = Column(BYTEA, nullable=True)  # Encrypted
    
    # Token metadata
    expires_at = Column(DateTime(timezone=True), nullable=False)
    scopes = Column(Text, nullable=True)  # Space-separated scopes
    
    # Refresh tracking
    last_refreshed_at = Column(DateTime(timezone=True), nullable=True)
    refresh_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    __table_args__ = (
        UniqueConstraint('shop_id', 'provider', name='uq_shop_provider'),
        Index('idx_oauth_tokens_tenant_shop', 'tenant_id', 'shop_id'),
        Index('idx_oauth_tokens_expires_at', 'expires_at'),  # For scheduled refresh queries
    )
    
    # Relationships
    shop = relationship("Shop", back_populates="oauth_tokens")
