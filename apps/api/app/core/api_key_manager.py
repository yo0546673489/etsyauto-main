"""
API Key Manager for Service-to-Service Authentication
Implements role-based API keys with scoping and revocation
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import secrets
import hashlib
import logging

from app.core.jwt_manager import get_jwt_manager, TokenType
from app.models.tenancy import Tenant

logger = logging.getLogger(__name__)


class APIKeyScope:
    """API key permission scopes"""
    # Read-only scopes
    READ_PRODUCTS = "products:read"
    READ_ORDERS = "orders:read"
    READ_AUDIT = "audit:read"

    # Write scopes
    WRITE_PRODUCTS = "products:write"

    # Admin scopes
    MANAGE_SHOPS = "shops:manage"
    MANAGE_TEAM = "team:manage"

    # System scopes
    SYSTEM_ADMIN = "system:admin"

    ALL_SCOPES = [
        READ_PRODUCTS, READ_ORDERS, READ_AUDIT,
        WRITE_PRODUCTS,
        MANAGE_SHOPS, MANAGE_TEAM, SYSTEM_ADMIN
    ]


class APIKeyManager:
    """
    Manages API keys for service-to-service authentication
    
    Features:
    - Role-based scopes (minimal privilege principle)
    - Tenant-scoped keys (multi-tenancy support)
    - Key rotation and revocation
    - Secure key hashing (SHA-256)
    - Audit logging
    """
    
    # Key format: etsy_<prefix>_<random>
    KEY_PREFIX = "etsy"
    KEY_LENGTH = 32  # bytes (256 bits)
    
    def __init__(self):
        self.jwt_manager = get_jwt_manager()
    
    def generate_api_key(
        self,
        service_name: str,
        scopes: List[str],
        tenant_id: Optional[int] = None,
        expires_days: int = 90,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a new API key
        
        Args:
            service_name: Name of the service using this key
            scopes: List of permission scopes
            tenant_id: Optional tenant ID for scoped keys
            expires_days: Number of days until expiration
            description: Optional description
        
        Returns:
            Dict with key, hash, and metadata
        """
        # Validate scopes
        invalid_scopes = set(scopes) - set(APIKeyScope.ALL_SCOPES)
        if invalid_scopes:
            raise ValueError(f"Invalid scopes: {invalid_scopes}")
        
        # Generate random key
        random_bytes = secrets.token_bytes(self.KEY_LENGTH)
        key_suffix = secrets.token_urlsafe(self.KEY_LENGTH)
        
        # Format: etsy_<service>_<random>
        service_prefix = service_name.lower().replace(' ', '_')[:10]
        api_key = f"{self.KEY_PREFIX}_{service_prefix}_{key_suffix}"
        
        # Hash the key for storage (never store plaintext)
        key_hash = self._hash_key(api_key)
        
        # Create JWT token with scopes
        token = self.jwt_manager.create_api_key(
            service_name=service_name,
            scopes=scopes,
            tenant_id=tenant_id
        )
        
        logger.info(
            f"Generated API key for service={service_name}, "
            f"scopes={scopes}, tenant={tenant_id}"
        )
        
        return {
            "api_key": api_key,  # Return only once, never again
            "key_hash": key_hash,  # Store this in database
            "token": token,  # JWT token with scopes
            "service_name": service_name,
            "scopes": scopes,
            "tenant_id": tenant_id,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=expires_days),
            "description": description,
            "key_prefix": f"{self.KEY_PREFIX}_{service_prefix}",  # For display
        }
    
    def _hash_key(self, api_key: str) -> str:
        """
        Hash API key for secure storage
        
        Args:
            api_key: Plaintext API key
        
        Returns:
            SHA-256 hash of the key
        """
        return hashlib.sha256(api_key.encode()).hexdigest()
    
    def verify_api_key(
        self,
        api_key: str,
        db: Session,
        required_scopes: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Verify an API key and check permissions
        
        Args:
            api_key: API key to verify
            db: Database session
            required_scopes: Optional list of required scopes
        
        Returns:
            Dict with key info and permissions
        
        Raises:
            ValueError: If key is invalid or lacks permissions
        """
        # Hash the provided key
        key_hash = self._hash_key(api_key)
        
        # Look up key in database
        from app.models.api_keys import APIKey
        stored_key = db.query(APIKey).filter(
            APIKey.key_hash == key_hash,
            APIKey.revoked_at == None
        ).first()
        
        if not stored_key:
            raise ValueError("Invalid or revoked API key")
        
        # Check expiration
        if stored_key.expires_at and stored_key.expires_at < datetime.utcnow():
            raise ValueError("API key expired")
        
        # Check required scopes
        if required_scopes:
            missing_scopes = set(required_scopes) - set(stored_key.scopes)
            if missing_scopes:
                raise ValueError(f"API key missing required scopes: {missing_scopes}")
        
        # Update last used timestamp
        stored_key.last_used_at = datetime.utcnow()
        db.commit()
        
        return {
            "id": stored_key.id,
            "service_name": stored_key.service_name,
            "scopes": stored_key.scopes,
            "tenant_id": stored_key.tenant_id,
            "description": stored_key.description,
        }
    
    def revoke_api_key(self, key_id: int, db: Session) -> None:
        """
        Revoke an API key
        
        Args:
            key_id: API key ID to revoke
            db: Database session
        """
        from app.models.api_keys import APIKey
        
        api_key = db.query(APIKey).filter(APIKey.id == key_id).first()
        if not api_key:
            raise ValueError("API key not found")
        
        api_key.revoked_at = datetime.utcnow()
        db.commit()
        
        logger.warning(
            f"Revoked API key: id={key_id}, service={api_key.service_name}"
        )
    
    def rotate_api_key(
        self,
        old_key_id: int,
        db: Session,
        expires_days: int = 90
    ) -> Dict[str, Any]:
        """
        Rotate an API key (create new, revoke old)
        
        Args:
            old_key_id: ID of key to rotate
            db: Database session
            expires_days: Expiration for new key
        
        Returns:
            New API key data
        """
        from app.models.api_keys import APIKey
        
        # Get old key
        old_key = db.query(APIKey).filter(APIKey.id == old_key_id).first()
        if not old_key:
            raise ValueError("API key not found")
        
        # Generate new key with same scopes
        new_key_data = self.generate_api_key(
            service_name=old_key.service_name,
            scopes=old_key.scopes,
            tenant_id=old_key.tenant_id,
            expires_days=expires_days,
            description=f"Rotated from key #{old_key_id}"
        )
        
        # Create new key record
        new_key = APIKey(
            key_hash=new_key_data["key_hash"],
            service_name=new_key_data["service_name"],
            scopes=new_key_data["scopes"],
            tenant_id=new_key_data["tenant_id"],
            expires_at=new_key_data["expires_at"],
            description=new_key_data["description"],
        )
        db.add(new_key)
        
        # Revoke old key
        old_key.revoked_at = datetime.utcnow()
        old_key.replaced_by_id = new_key.id
        
        db.commit()
        
        logger.info(
            f"Rotated API key: old_id={old_key_id} → new_id={new_key.id}, "
            f"service={old_key.service_name}"
        )
        
        return new_key_data
    
    def list_api_keys(
        self,
        db: Session,
        tenant_id: Optional[int] = None,
        include_revoked: bool = False
    ) -> List[Dict[str, Any]]:
        """
        List API keys
        
        Args:
            db: Database session
            tenant_id: Filter by tenant ID
            include_revoked: Include revoked keys
        
        Returns:
            List of API key info (without actual keys)
        """
        from app.models.api_keys import APIKey
        
        query = db.query(APIKey)
        
        if tenant_id:
            query = query.filter(APIKey.tenant_id == tenant_id)
        
        if not include_revoked:
            query = query.filter(APIKey.revoked_at == None)
        
        keys = query.order_by(APIKey.created_at.desc()).all()
        
        return [
            {
                "id": key.id,
                "key_prefix": key.key_hash[:12] + "...",  # Show first 12 chars of hash
                "service_name": key.service_name,
                "scopes": key.scopes,
                "tenant_id": key.tenant_id,
                "created_at": key.created_at,
                "expires_at": key.expires_at,
                "last_used_at": key.last_used_at,
                "revoked_at": key.revoked_at,
                "description": key.description,
            }
            for key in keys
        ]


# Global API key manager instance
api_key_manager = APIKeyManager()


def get_api_key_manager() -> APIKeyManager:
    """Get global API key manager instance"""
    return api_key_manager

