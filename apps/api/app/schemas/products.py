"""
Product Schemas - Request/Response models
"""
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class ProductImportRequest(BaseModel):
    """Single product import"""
    sku: Optional[str] = None
    title_raw: str
    description_raw: Optional[str] = None
    tags_raw: Optional[List[str]] = None
    images: Optional[List[str]] = None
    variants: Optional[Dict] = None
    price: Optional[int] = None
    quantity: Optional[int] = None
    cost_usd_cents: Optional[int] = None


class ProductImportBatchRequest(BaseModel):
    """Batch product import"""
    products: List[ProductImportRequest]
    batch_id: Optional[str] = None


class ProductResponse(BaseModel):
    """Product response"""
    id: int
    sku: Optional[str]
    shop_id: Optional[int]
    etsy_listing_id: Optional[str]
    title_raw: Optional[str]
    description_raw: Optional[str]
    tags_raw: Optional[List[str]]
    images: Optional[List[str]]
    price: Optional[int]
    quantity: Optional[int]
    cost_usd_cents: Optional[int] = 0
    source: str
    ingest_batch_id: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
