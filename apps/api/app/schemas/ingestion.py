"""
Product Ingestion Schemas
Enhanced validation schemas for product ingestion
"""
from pydantic import BaseModel, Field, field_validator, HttpUrl, ValidationError
from typing import Optional, List, Dict, Any
from datetime import datetime
import re


class VariantSchema(BaseModel):
    """Product variant validation"""
    name: str = Field(..., min_length=1, max_length=255, description="Variant name (e.g., 'Color', 'Size')")
    value: str = Field(..., min_length=1, max_length=255, description="Variant value (e.g., 'Red', 'Large')")
    price_modifier: Optional[int] = Field(None, ge=-999999, le=999999, description="Price modifier in cents")
    sku: Optional[str] = Field(None, max_length=255)
    quantity: Optional[int] = Field(None, ge=0)


class ImageSchema(BaseModel):
    """Product image validation"""
    url: str = Field(..., description="Image URL")
    alt_text: Optional[str] = Field(None, max_length=500)
    is_primary: bool = Field(False, description="Whether this is the primary image")
    
    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        """Validate URL format (HTTP/HTTPS)"""
        if not v:
            raise ValueError("Image URL is required")
        # Check if it's a valid URL format
        url_pattern = re.compile(
            r'^https?://'  # http:// or https://
            r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
            r'localhost|'  # localhost...
            r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
            r'(?::\d+)?'  # optional port
            r'(?:/?|[/?]\S+)$', re.IGNORECASE)
        if not url_pattern.match(v):
            raise ValueError(f"Invalid URL format: {v}")
        return v


class ProductRowSchema(BaseModel):
    """Validated product row from CSV/JSON"""
    sku: Optional[str] = Field(None, max_length=255, description="Product SKU")
    title: str = Field(..., min_length=1, max_length=140, description="Product title (Etsy limit: 140 chars)")
    description: Optional[str] = Field(None, max_length=10000, description="Product description")
    tags: Optional[List[str]] = Field(None, max_length=13, description="Product tags (Etsy limit: 13)")
    images: Optional[List[str]] = Field(None, max_length=10, description="Image URLs (Etsy limit: 10)")
    variants: Optional[List[Dict[str, Any]]] = Field(None, description="Product variants")
    price: Optional[float] = Field(None, ge=0.01, le=999999.99, description="Price in dollars")
    quantity: Optional[int] = Field(None, ge=0, le=999999, description="Available quantity")
    
    # Row metadata (for error reporting)
    row_number: Optional[int] = Field(None, description="Row number in source file")
    raw_data: Optional[Dict[str, Any]] = Field(None, description="Original row data")
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v):
        """Title cannot be empty"""
        if not v or not v.strip():
            raise ValueError("Title is required and cannot be empty")
        return v.strip()
    
    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v):
        """Validate tags length and count"""
        if v is None:
            return []
        # Etsy limit: 13 tags, each max 20 chars
        if len(v) > 13:
            raise ValueError(f"Maximum 13 tags allowed, got {len(v)}")
        for tag in v:
            if len(tag) > 20:
                raise ValueError(f"Tag '{tag}' exceeds 20 character limit")
        return [tag.strip() for tag in v if tag.strip()]
    
    @field_validator('images')
    @classmethod
    def validate_images(cls, v):
        """Validate image URLs"""
        if v is None:
            return []
        if len(v) > 10:
            raise ValueError(f"Maximum 10 images allowed, got {len(v)}")
        # Basic URL validation
        url_pattern = re.compile(r'^https?://', re.IGNORECASE)
        for img_url in v:
            if not url_pattern.match(img_url):
                raise ValueError(f"Invalid image URL format: {img_url}")
        return v
    
    @field_validator('price')
    @classmethod
    def validate_price(cls, v):
        """Convert price to cents if provided"""
        if v is None:
            return None
        return int(v * 100)  # Convert to cents
    
    @field_validator('variants')
    @classmethod
    def validate_variants(cls, v):
        """Validate variant structure"""
        if v is None:
            return []
        validated_variants = []
        for variant in v:
            try:
                validated = VariantSchema(**variant)
                validated_variants.append(validated.model_dump())
            except ValidationError as e:
                raise ValueError(f"Invalid variant: {e.errors()}")
        return validated_variants
    
    model_config = {"extra": "allow", "from_attributes": True}


class IngestionBatchResponse(BaseModel):
    """Ingestion batch response"""
    id: int
    batch_id: str
    filename: Optional[str]
    file_type: str
    status: str
    total_rows: int
    successful_rows: int
    failed_rows: int
    error_report_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    
    model_config = {"from_attributes": True}


class IngestionUploadResponse(BaseModel):
    """Response after uploading a batch"""
    batch_id: str
    message: str
    status: str
    estimated_rows: Optional[int] = None


class IngestionStatusResponse(BaseModel):
    """Batch processing status"""
    batch_id: str
    status: str
    total_rows: int
    successful_rows: int
    failed_rows: int
    progress_percent: float
    error_report_url: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class IngestionErrorReport(BaseModel):
    """Error report structure"""
    row_number: int
    sku: Optional[str]
    title: Optional[str]
    errors: List[str]
    raw_data: Dict[str, Any]

