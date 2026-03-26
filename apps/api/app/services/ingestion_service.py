"""
Product Ingestion Service
Handles CSV/JSON parsing, validation, and error collection
"""
import csv
import json
import io
import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import uuid

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.schemas.ingestion import ProductRowSchema, IngestionErrorReport
from app.models.products import Product
from app.models.ingestion import IngestionBatch

logger = logging.getLogger(__name__)


class IngestionService:
    """Service for processing product ingestion batches"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def parse_csv(self, csv_content: str, filename: str) -> Tuple[List[Dict[str, Any]], int]:
        """
        Parse CSV content and return list of row dictionaries
        
        Args:
            csv_content: CSV file content as string
            filename: Original filename
            
        Returns:
            Tuple of (parsed_rows, total_row_count)
        """
        try:
            csv_reader = csv.DictReader(io.StringIO(csv_content))
            rows = []
            row_num = 0
            
            for row in csv_reader:
                row_num += 1
                # Convert row to dict and normalize keys
                normalized_row = {}
                for key, value in row.items():
                    # Normalize column names (case-insensitive, strip whitespace)
                    normalized_key = key.strip().lower().replace(' ', '_')
                    normalized_row[normalized_key] = value.strip() if value else None
                
                # Map common column variations
                row_dict = {
                    'sku': normalized_row.get('sku') or normalized_row.get('product_sku') or normalized_row.get('id'),
                    'title': normalized_row.get('title') or normalized_row.get('name') or normalized_row.get('product_name'),
                    'description': normalized_row.get('description') or normalized_row.get('desc'),
                    'price': normalized_row.get('price') or normalized_row.get('cost'),
                    'quantity': normalized_row.get('quantity') or normalized_row.get('qty') or normalized_row.get('stock'),
                    'tags': normalized_row.get('tags'),
                    'images': normalized_row.get('images') or normalized_row.get('image_urls'),
                    'variants': normalized_row.get('variants'),
                    'row_number': row_num,
                    'raw_data': row  # Keep original row for error reporting
                }
                
                rows.append(row_dict)
            
            return rows, row_num
            
        except Exception as e:
            logger.error(f"Error parsing CSV: {str(e)}")
            raise ValueError(f"Failed to parse CSV: {str(e)}")
    
    def parse_json(self, json_content: str, filename: str) -> Tuple[List[Dict[str, Any]], int]:
        """
        Parse JSON content and return list of product dictionaries
        
        Args:
            json_content: JSON file content as string
            filename: Original filename
            
        Returns:
            Tuple of (parsed_rows, total_row_count)
        """
        try:
            data = json.loads(json_content)
            
            # Handle different JSON structures
            if isinstance(data, list):
                # Array of products
                rows = []
                for idx, item in enumerate(data, start=1):
                    item['row_number'] = idx
                    item['raw_data'] = item.copy()
                    rows.append(item)
                return rows, len(rows)
            elif isinstance(data, dict):
                # Single product or object with 'products' key
                if 'products' in data:
                    rows = []
                    for idx, item in enumerate(data['products'], start=1):
                        item['row_number'] = idx
                        item['raw_data'] = item.copy()
                        rows.append(item)
                    return rows, len(rows)
                else:
                    # Single product
                    data['row_number'] = 1
                    data['raw_data'] = data.copy()
                    return [data], 1
            else:
                raise ValueError("Invalid JSON structure: expected array or object")
                
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON format: {str(e)}")
        except Exception as e:
            logger.error(f"Error parsing JSON: {str(e)}")
            raise ValueError(f"Failed to parse JSON: {str(e)}")
    
    def parse_tags(self, tags_input: Any) -> List[str]:
        """Parse tags from various input formats"""
        if tags_input is None:
            return []
        
        if isinstance(tags_input, list):
            return [str(tag).strip() for tag in tags_input if tag]
        
        if isinstance(tags_input, str):
            # Support pipe, comma, or semicolon separated
            separators = ['|', ',', ';']
            for sep in separators:
                if sep in tags_input:
                    return [tag.strip() for tag in tags_input.split(sep) if tag.strip()]
            return [tags_input.strip()] if tags_input.strip() else []
        
        return []
    
    def parse_images(self, images_input: Any) -> List[str]:
        """Parse images from various input formats"""
        if images_input is None:
            return []
        
        if isinstance(images_input, list):
            return [str(img).strip() for img in images_input if img]
        
        if isinstance(images_input, str):
            # Support pipe, comma, or semicolon separated URLs
            separators = ['|', ',', ';']
            for sep in separators:
                if sep in images_input:
                    return [img.strip() for img in images_input.split(sep) if img.strip()]
            return [images_input.strip()] if images_input.strip() else []
        
        return []
    
    def parse_price(self, price_input: Any) -> Optional[int]:
        """Parse price and convert to cents"""
        if price_input is None:
            return None
        
        try:
            # Handle string or number
            if isinstance(price_input, str):
                # Remove currency symbols and whitespace
                price_input = price_input.replace('$', '').replace(',', '').strip()
            
            price_float = float(price_input)
            if price_float < 0:
                return None
            return int(price_float * 100)  # Convert to cents
        except (ValueError, TypeError):
            return None
    
    def parse_quantity(self, qty_input: Any) -> Optional[int]:
        """Parse quantity"""
        if qty_input is None:
            return None
        
        try:
            qty = int(float(qty_input))
            return max(0, qty)  # Ensure non-negative
        except (ValueError, TypeError):
            return None
    
    def validate_and_normalize_row(self, row: Dict[str, Any], row_number: int) -> Tuple[Optional[ProductRowSchema], List[str]]:
        """
        Validate and normalize a single product row
        
        Args:
            row: Raw row data
            row_number: Row number for error reporting
            
        Returns:
            Tuple of (validated_product, list_of_errors)
        """
        errors = []
        
        # Normalize the row data
        try:
            # Parse complex fields
            tags = self.parse_tags(row.get('tags'))
            images = self.parse_images(row.get('images'))
            price = self.parse_price(row.get('price'))
            quantity = self.parse_quantity(row.get('quantity'))
            
            # Parse variants if present
            variants = None
            if row.get('variants'):
                try:
                    if isinstance(row['variants'], str):
                        variants = json.loads(row['variants'])
                    elif isinstance(row['variants'], (list, dict)):
                        variants = row['variants']
                except (json.JSONDecodeError, TypeError):
                    errors.append(f"Invalid variants format at row {row_number}")
            
            # Build normalized row
            normalized_row = {
                'sku': row.get('sku'),
                'title': row.get('title'),
                'description': row.get('description'),
                'tags': tags,
                'images': images,
                'variants': variants,
                'price': price / 100.0 if price else None,  # Convert cents to dollars for validation
                'quantity': quantity,
                'row_number': row_number,
                'raw_data': row.get('raw_data', row)
            }
            
            # Validate with Pydantic schema
            try:
                validated = ProductRowSchema(**normalized_row)
                return validated, errors
            except ValidationError as e:
                # Collect validation errors
                for error in e.errors():
                    field = error.get('loc', ['unknown'])[-1]
                    msg = error.get('msg', 'Validation error')
                    errors.append(f"Row {row_number}, field '{field}': {msg}")
                return None, errors
                
        except Exception as e:
            errors.append(f"Row {row_number}: Unexpected error - {str(e)}")
            return None, errors
    
    def validate_batch(self, rows: List[Dict[str, Any]]) -> Tuple[List[ProductRowSchema], List[IngestionErrorReport]]:
        """
        Validate all rows in a batch
        
        Args:
            rows: List of raw row dictionaries
            
        Returns:
            Tuple of (validated_products, error_reports)
        """
        validated_products = []
        error_reports = []
        
        for row in rows:
            row_number = row.get('row_number', 0)
            validated, errors = self.validate_and_normalize_row(row, row_number)
            
            if validated and not errors:
                validated_products.append(validated)
            else:
                # Create error report
                error_report = IngestionErrorReport(
                    row_number=row_number,
                    sku=row.get('sku'),
                    title=row.get('title'),
                    errors=errors if errors else ['Validation failed'],
                    raw_data=row.get('raw_data', row)
                )
                error_reports.append(error_report)
        
        return validated_products, error_reports
    
    def save_products(
        self,
        validated_products: List[ProductRowSchema],
        tenant_id: int,
        shop_id: Optional[int],
        batch_id: str,
        source: str = 'upload'
    ) -> int:
        """
        Save validated products to database
        
        Args:
            validated_products: List of validated products
            tenant_id: Tenant ID
            shop_id: Optional shop ID
            batch_id: Batch ID
            source: Source type ('csv', 'json', etc.)
            
        Returns:
            Number of products saved
        """
        saved_count = 0
        
        for validated in validated_products:
            try:
                product = Product(
                    tenant_id=tenant_id,
                    # Note: Product model doesn't have shop_id field
                    sku=validated.sku,
                    title_raw=validated.title,
                    description_raw=validated.description,
                    tags_raw=validated.tags or [],
                    images=validated.images or [],
                    variants=validated.variants or [],
                    price=validated.price,  # Already in cents
                    quantity=validated.quantity,
                    source=source,
                    ingest_batch_id=batch_id
                )
                
                self.db.add(product)
                saved_count += 1
                
            except Exception as e:
                logger.error(f"Error saving product at row {validated.row_number}: {str(e)}")
                # Continue with other products
        
        try:
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error committing products: {str(e)}")
            raise
        
        return saved_count

