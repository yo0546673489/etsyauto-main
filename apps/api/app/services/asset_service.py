"""
Asset Service
Handle image URL validation and signed URL generation for S3/R2
"""
import logging
from typing import List, Optional
from urllib.parse import urlparse
import re

logger = logging.getLogger(__name__)


class AssetService:
    """Service for handling product assets (images, etc.)"""
    
    def __init__(self, storage_backend: str = "url", s3_config: Optional[dict] = None):
        """
        Initialize asset service
        
        Args:
            storage_backend: Storage backend type ('url', 's3', 'r2')
            s3_config: S3/R2 configuration (access_key, secret_key, bucket, region, endpoint_url)
        """
        self.storage_backend = storage_backend
        self.s3_config = s3_config or {}
        
        # Initialize S3 client if needed
        self.s3_client = None
        if storage_backend in ('s3', 'r2'):
            try:
                import boto3
                self.s3_client = boto3.client(
                    's3',
                    aws_access_key_id=s3_config.get('access_key'),
                    aws_secret_access_key=s3_config.get('secret_key'),
                    region_name=s3_config.get('region', 'us-east-1'),
                    endpoint_url=s3_config.get('endpoint_url')  # For R2
                )
                self.bucket_name = s3_config.get('bucket')
            except ImportError:
                logger.warning("boto3 not installed, S3/R2 features unavailable")
                self.storage_backend = 'url'
    
    def validate_image_url(self, url: str) -> bool:
        """
        Validate that an image URL is accessible and in a valid format
        
        Args:
            url: Image URL to validate
            
        Returns:
            True if URL is valid, False otherwise
        """
        if not url:
            return False
        
        # Check URL format
        try:
            parsed = urlparse(url)
            if parsed.scheme not in ('http', 'https'):
                return False
            if not parsed.netloc:
                return False
        except Exception:
            return False
        
        # Additional validation could check if URL is accessible
        # For now, just validate format
        return True
    
    def generate_signed_url(self, key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a signed URL for an S3/R2 object
        
        Args:
            key: Object key/path
            expiration: URL expiration time in seconds
            
        Returns:
            Signed URL or None if not using S3/R2
        """
        if self.storage_backend not in ('s3', 'r2') or not self.s3_client:
            return None
        
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=expiration
            )
            return url
        except Exception as e:
            logger.error(f"Error generating signed URL: {str(e)}")
            return None
    
    def stage_image(self, image_url: str, product_id: int, image_index: int) -> Optional[str]:
        """
        Stage an image (download from URL and upload to S3/R2 if configured)
        
        Args:
            image_url: Source image URL
            product_id: Product ID
            image_index: Image index
            
        Returns:
            Staged image URL (S3/R2 URL or original URL)
        """
        # For now, return original URL
        # In production, this would:
        # 1. Download image from source URL
        # 2. Validate image format and size
        # 3. Upload to S3/R2
        # 4. Return S3/R2 URL or signed URL
        
        if self.storage_backend == 'url':
            return image_url if self.validate_image_url(image_url) else None
        
        # TODO: Implement S3/R2 staging
        return image_url
    
    def validate_image_urls(self, urls: List[str]) -> List[str]:
        """
        Validate a list of image URLs and return valid ones
        
        Args:
            urls: List of image URLs
            
        Returns:
            List of valid image URLs
        """
        valid_urls = []
        for url in urls:
            if self.validate_image_url(url):
                valid_urls.append(url)
        return valid_urls

