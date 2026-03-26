"""
Encryption Manager with Key Rotation Support
Handles encryption of sensitive data at rest with zero-downtime key rotation
"""
from cryptography.fernet import Fernet, MultiFernet
from typing import Optional, List
import base64
import logging
import json
from datetime import datetime

from app.core.secrets_manager import get_secrets_manager

logger = logging.getLogger(__name__)


class EncryptionManager:
    """
    Manages encryption of sensitive data with key rotation support
    
    Features:
    - Fernet symmetric encryption (AES-128-CBC + HMAC)
    - Multi-key support for zero-downtime rotation
    - Automatic re-encryption during rotation
    - Key versioning
    """
    
    def __init__(self):
        self.secrets_manager = get_secrets_manager()
        self._primary_key: Optional[Fernet] = None
        self._rotation_keys: List[Fernet] = []
        self._cipher: Optional[MultiFernet] = None
        self._key_version = "v1"
        self._initialize_cipher()
    
    def _initialize_cipher(self) -> None:
        """Initialize Fernet cipher with current keys"""
        try:
            # Get primary encryption key
            primary_key_str = self.secrets_manager.get_encryption_key()
            self._primary_key = Fernet(primary_key_str.encode())
            
            # Check for rotation keys (for graceful key rotation)
            rotation_keys_str = self.secrets_manager.get_secret(
                'ENCRYPTION_KEY_ROTATION',
                required=False
            )
            
            if rotation_keys_str:
                # Multiple keys for rotation period
                rotation_keys_list = json.loads(rotation_keys_str)
                self._rotation_keys = [
                    Fernet(key.encode()) for key in rotation_keys_list
                ]
                
                # MultiFernet tries keys in order (newest first)
                all_keys = [self._primary_key] + self._rotation_keys
                self._cipher = MultiFernet(all_keys)
                
                logger.info(
                    f"✅ Encryption initialized with {len(all_keys)} keys "
                    f"(1 primary + {len(self._rotation_keys)} rotation)"
                )
            else:
                # Single key mode
                self._cipher = self._primary_key
                logger.info("✅ Encryption initialized with single key")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize encryption: {e}")
            raise
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt plaintext string
        
        Args:
            plaintext: String to encrypt
        
        Returns:
            Base64-encoded encrypted data
        """
        if not plaintext:
            return ""
        
        try:
            encrypted = self._cipher.encrypt(plaintext.encode())
            return base64.b64encode(encrypted).decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise
    
    def decrypt(self, encrypted_data: str) -> str:
        """
        Decrypt encrypted string
        
        Args:
            encrypted_data: Base64-encoded encrypted data
        
        Returns:
            Decrypted plaintext
        """
        if not encrypted_data:
            return ""
        
        try:
            encrypted_bytes = base64.b64decode(encrypted_data.encode())
            decrypted = self._cipher.decrypt(encrypted_bytes)
            return decrypted.decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise
    
    def encrypt_dict(self, data: dict, fields_to_encrypt: List[str]) -> dict:
        """
        Encrypt specific fields in a dictionary
        
        Args:
            data: Dictionary containing data
            fields_to_encrypt: List of field names to encrypt
        
        Returns:
            Dictionary with encrypted fields
        """
        encrypted_data = data.copy()
        
        for field in fields_to_encrypt:
            if field in encrypted_data and encrypted_data[field]:
                encrypted_data[field] = self.encrypt(str(encrypted_data[field]))
        
        return encrypted_data
    
    def decrypt_dict(self, data: dict, fields_to_decrypt: List[str]) -> dict:
        """
        Decrypt specific fields in a dictionary
        
        Args:
            data: Dictionary containing encrypted data
            fields_to_decrypt: List of field names to decrypt
        
        Returns:
            Dictionary with decrypted fields
        """
        decrypted_data = data.copy()
        
        for field in fields_to_decrypt:
            if field in decrypted_data and decrypted_data[field]:
                decrypted_data[field] = self.decrypt(decrypted_data[field])
        
        return decrypted_data
    
    def rotate_key(self, new_key: str) -> None:
        """
        Add a new encryption key for rotation
        
        This enables zero-downtime key rotation:
        1. New key is added as primary
        2. Old key is kept for decryption
        3. New data is encrypted with new key
        4. Old data can still be decrypted
        5. Background job re-encrypts old data
        6. After re-encryption, old key is removed
        
        Args:
            new_key: New Fernet key (base64-encoded)
        """
        try:
            # Validate new key
            new_fernet = Fernet(new_key.encode())
            
            # Move current primary to rotation keys
            if self._primary_key:
                self._rotation_keys.insert(0, self._primary_key)
            
            # Set new primary
            self._primary_key = new_fernet
            
            # Update cipher with all keys
            all_keys = [self._primary_key] + self._rotation_keys
            self._cipher = MultiFernet(all_keys)
            
            # Increment key version
            version_num = int(self._key_version.replace('v', '')) + 1
            old_version = self._key_version
            self._key_version = f"v{version_num}"
            
            logger.warning(
                f"🔄 Encryption key rotated: {old_version} → {self._key_version}. "
                f"Total keys: {len(all_keys)} (1 primary + {len(self._rotation_keys)} rotation)"
            )
            
        except Exception as e:
            logger.error(f"Key rotation failed: {e}")
            raise
    
    def re_encrypt(self, encrypted_data: str) -> str:
        """
        Re-encrypt data with current primary key
        
        Used during key rotation to update old encrypted data
        
        Args:
            encrypted_data: Data encrypted with old key
        
        Returns:
            Data re-encrypted with current primary key
        """
        try:
            # Decrypt with any available key
            plaintext = self.decrypt(encrypted_data)
            
            # Re-encrypt with current primary key
            new_encrypted = self._primary_key.encrypt(plaintext.encode())
            return base64.b64encode(new_encrypted).decode()
            
        except Exception as e:
            logger.error(f"Re-encryption failed: {e}")
            raise
    
    def cleanup_old_keys(self, max_rotation_keys: int = 1) -> None:
        """
        Remove old rotation keys
        
        Should only be called after all data has been re-encrypted
        
        Args:
            max_rotation_keys: Maximum number of rotation keys to keep
        """
        if len(self._rotation_keys) > max_rotation_keys:
            removed = len(self._rotation_keys) - max_rotation_keys
            self._rotation_keys = self._rotation_keys[:max_rotation_keys]
            
            # Update cipher
            all_keys = [self._primary_key] + self._rotation_keys
            self._cipher = MultiFernet(all_keys)
            
            logger.warning(
                f"🧹 Removed {removed} old encryption keys. "
                f"Remaining: {len(all_keys)} total"
            )
    
    def get_key_info(self) -> dict:
        """
        Get information about current encryption keys
        
        Returns:
            Dict with key version and count
        """
        return {
            "version": self._key_version,
            "primary_key": "present",
            "rotation_keys_count": len(self._rotation_keys),
            "total_keys": 1 + len(self._rotation_keys),
        }
    
    @staticmethod
    def generate_key() -> str:
        """
        Generate a new Fernet encryption key
        
        Returns:
            Base64-encoded Fernet key
        """
        return Fernet.generate_key().decode()


# Global encryption manager instance
encryption_manager = EncryptionManager()


def get_encryption_manager() -> EncryptionManager:
    """Get global encryption manager instance"""
    return encryption_manager

