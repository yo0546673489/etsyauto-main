"""
Secrets Management
Centralized secrets loading from environment or secrets vault
"""
import os
import logging
from typing import Optional, Dict, Any
from pathlib import Path
import json

logger = logging.getLogger(__name__)


class SecretsManager:
    """
    Manages secrets from multiple sources:
    1. Environment variables
    2. Secrets files (Docker secrets, Kubernetes secrets)
    3. AWS Secrets Manager (optional)
    4. HashiCorp Vault (optional)
    """
    
    def __init__(self):
        self._secrets_cache: Dict[str, str] = {}
        self._secrets_dir = os.getenv('SECRETS_DIR', '/run/secrets')
        self._required_secrets = [
            'DATABASE_URL',
            'REDIS_URL',
            'API_SECRET_KEY',
            'ENCRYPTION_KEY',
            'ETSY_CLIENT_SECRET',
        ]
    
    def get_secret(self, key: str, required: bool = True) -> Optional[str]:
        """
        Get a secret from the best available source
        
        Priority order:
        1. Environment variable
        2. File in secrets directory (Docker/K8s secrets)
        3. Cache (if previously loaded)
        
        Args:
            key: Secret key name
            required: Whether this secret is required
        
        Returns:
            Secret value or None
        
        Raises:
            ValueError: If required secret is not found
        """
        # Check cache first
        if key in self._secrets_cache:
            return self._secrets_cache[key]
        
        # Check environment variable
        value = os.getenv(key)
        if value:
            self._secrets_cache[key] = value
            return value
        
        # Check secrets file (Docker/K8s secrets)
        secret_file = Path(self._secrets_dir) / key
        if secret_file.exists():
            try:
                value = secret_file.read_text().strip()
                self._secrets_cache[key] = value
                logger.info(f"✅ Loaded secret '{key}' from file")
                return value
            except Exception as e:
                logger.warning(f"⚠️ Failed to read secret file {secret_file}: {e}")
        
        # Not found
        if required:
            raise ValueError(
                f"❌ Required secret '{key}' not found. "
                f"Set as environment variable or provide in {self._secrets_dir}/{key}"
            )
        
        return None
    
    def validate_required_secrets(self) -> None:
        """
        Validate that all required secrets are present
        
        Raises:
            ValueError: If any required secret is missing
        """
        missing = []
        for key in self._required_secrets:
            try:
                self.get_secret(key, required=True)
            except ValueError:
                missing.append(key)
        
        if missing:
            raise ValueError(
                f"❌ Missing required secrets: {', '.join(missing)}\n"
                f"Set these as environment variables or provide files in {self._secrets_dir}/"
            )
        
        logger.info(f"✅ All {len(self._required_secrets)} required secrets validated")
    
    def get_jwt_private_key(self) -> str:
        """Get JWT RS256 private key"""
        return self.get_secret('JWT_PRIVATE_KEY', required=True)
    
    def get_jwt_public_key(self) -> str:
        """Get JWT RS256 public key"""
        return self.get_secret('JWT_PUBLIC_KEY', required=True)
    
    def get_encryption_key(self) -> str:
        """Get encryption key for data at rest"""
        return self.get_secret('ENCRYPTION_KEY', required=True)
    
    def get_database_url(self) -> str:
        """Get database connection URL"""
        return self.get_secret('DATABASE_URL', required=True)
    
    def get_etsy_client_secret(self) -> str:
        """Get Etsy OAuth client secret"""
        return self.get_secret('ETSY_CLIENT_SECRET', required=True)
    
    def get_google_client_secret(self) -> str:
        """Get Google OAuth client secret"""
        return self.get_secret('GOOGLE_CLIENT_SECRET', required=False)
    
    def rotate_encryption_key(self, new_key: str) -> None:
        """
        Rotate encryption key
        
        Args:
            new_key: New encryption key
        
        Note:
            This only updates the cache. Actual key rotation requires:
            1. Re-encrypting all data with new key
            2. Updating secret storage
            3. Graceful worker restart
        """
        old_key = self._secrets_cache.get('ENCRYPTION_KEY')
        self._secrets_cache['ENCRYPTION_KEY'] = new_key
        logger.warning(
            f"🔄 Encryption key rotated. "
            f"Old key prefix: {old_key[:8] if old_key else 'None'}... "
            f"New key prefix: {new_key[:8]}..."
        )
    
    def mask_secret(self, secret: str, visible_chars: int = 4) -> str:
        """
        Mask a secret for logging
        
        Args:
            secret: Secret to mask
            visible_chars: Number of characters to show at start
        
        Returns:
            Masked secret (e.g., "sk-1234...")
        """
        if not secret:
            return "[EMPTY]"
        
        if len(secret) <= visible_chars:
            return "*" * len(secret)
        
        return f"{secret[:visible_chars]}{'*' * (len(secret) - visible_chars)}"
    
    def get_all_secrets_status(self) -> Dict[str, Any]:
        """
        Get status of all secrets (for health checks)
        
        Returns:
            Dict with secret status (masked values)
        """
        status = {}
        
        for key in self._required_secrets:
            try:
                value = self.get_secret(key, required=False)
                status[key] = {
                    'present': bool(value),
                    'source': 'env' if os.getenv(key) else 'file' if value else 'missing',
                    'value_preview': self.mask_secret(value) if value else None
                }
            except Exception as e:
                status[key] = {
                    'present': False,
                    'source': 'error',
                    'error': str(e)
                }
        
        return status


# Global secrets manager instance
secrets_manager = SecretsManager()


def get_secrets_manager() -> SecretsManager:
    """Get global secrets manager instance"""
    return secrets_manager

