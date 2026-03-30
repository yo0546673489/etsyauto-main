"""
Products API Endpoints
"""

from datetime import datetime, timezone
import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import csv
import io
import json

from app.core.config import settings
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.api.dependencies import (
    get_user_context, 
    UserContext, 
    require_permission,
    require_any_permission
)
from app.core.rbac import Permission
from app.core.query_helpers import filter_by_tenant, ensure_tenant_access, ensure_shop_access
from app.models.products import Product
from app.models.tenancy import Shop
from app.schemas.products import (
    ProductImportRequest,
    ProductImportBatchRequest,
    ProductResponse,
)
from app.core.redis import get_redis_client
from app.services.token_manager import TokenManager
from app.worker.tasks.product_sync_tasks import sync_products_from_etsy

logger = logging.getLogger(__name__)

router = APIRouter()


class SyncEtsyBody(BaseModel):
    """Optional body for POST /sync/etsy so shop_id can be sent in body if query is stripped."""
    shop_id: Optional[int] = None


@router.post("/import", tags=["Products"])
async def import_product(
    request: ProductImportRequest,
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Import a single product manually
    Requires: CREATE_PRODUCT permission (Owner, Admin, Creator)
    """
    product = Product(
        tenant_id=context.tenant_id,
        sku=request.sku,
        title_raw=request.title_raw,
        description_raw=request.description_raw,
        tags_raw=request.tags_raw,
        images=request.images,
        variants=request.variants,
        price=request.price,
        quantity=request.quantity,
        cost_usd_cents=request.cost_usd_cents or 0,
        source='manual'
    )
    
    db.add(product)
    db.commit()
    db.refresh(product)
    
    return {
        "message": "Product imported successfully",
        "product_id": product.id
    }


@router.post("/import/batch", tags=["Products"])
async def import_batch(
    request: ProductImportBatchRequest,
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Import multiple products at once
    Requires: CREATE_PRODUCT permission (Owner, Admin, Creator)
    """
    batch_id = request.batch_id or f"batch_{int(datetime.now(timezone.utc).timestamp())}"
    
    products = []
    for item in request.products:
        product =         Product(
            tenant_id=context.tenant_id,
            sku=item.sku,
            title_raw=item.title_raw,
            description_raw=item.description_raw,
            tags_raw=item.tags_raw,
            images=item.images,
            variants=item.variants,
            price=item.price,
            quantity=item.quantity,
            cost_usd_cents=item.cost_usd_cents or 0,
            source='json',
            ingest_batch_id=batch_id
        )
        products.append(product)
    
    db.add_all(products)
    db.commit()
    
    return {
        "message": f"Imported {len(products)} products",
        "batch_id": batch_id,
        "count": len(products)
    }


@router.post("/import/csv", tags=["Products"])
async def import_csv(
    file: UploadFile = File(...),
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Import products from CSV file
    
    CSV Format (expected columns):
    sku,title,description,price,quantity
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV")
    
    # Read CSV with size limit
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB limit"
        )
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8")

    # Validate & sanitize CSV (formula-injection prevention, required cols, etc.)
    from app.services.csv_validator import validate_and_sanitize_csv
    valid_rows, row_errors = validate_and_sanitize_csv(csv_text)

    if row_errors and not valid_rows:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "CSV validation failed — no valid rows",
                "errors": row_errors[:50],  # Cap to prevent huge payloads
            },
        )

    batch_id = f"csv_{int(datetime.now(timezone.utc).timestamp())}"
    products = []
    
    for row in valid_rows:
        # Parse tags (pipe-separated, optional)
        tags = row.get('tags', '').split('|') if row.get('tags') else []
        
        # Parse images (pipe-separated URLs, optional)
        images = row.get('images', '').split('|') if row.get('images') else []
        
        # Parse price (convert to cents)
        price = None
        if row.get('price'):
            try:
                price = int(float(row['price']) * 100)
            except Exception:
                pass
        
        # Parse quantity
        quantity = None
        if row.get('quantity'):
            try:
                quantity = int(row['quantity'])
            except Exception:
                pass
        
        product = Product(
            tenant_id=context.tenant_id,
            sku=row.get('sku'),
            title_raw=row.get('title', ''),
            description_raw=row.get('description', ''),
            tags_raw=tags,
            images=images,
            price=price,
            quantity=quantity,
            source='csv',
            ingest_batch_id=batch_id
        )
        products.append(product)
    
    db.add_all(products)
    db.commit()
    
    result = {
        "message": f"Imported {len(products)} products from CSV",
        "batch_id": batch_id,
        "count": len(products),
    }
    if row_errors:
        result["row_errors"] = row_errors[:50]
        result["skipped_rows"] = len(row_errors)
    return result


@router.get("/export/problem-products", tags=["Products"])
async def export_problem_products(
    batch_id: Optional[str] = None,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Export products with validation issues as CSV
    Includes products with missing required fields or other problems
    Requires: READ_PRODUCT permission
    Suppliers/viewers see only products from shops assigned to them.
    """
    from fastapi.responses import StreamingResponse
    
    # Get products with issues (missing required fields for Etsy listing)
    query = filter_by_tenant(db.query(Product), context.tenant_id, Product.tenant_id)
    
    # Suppliers/viewers: products in assigned shops OR tenant-wide (shop_id null)
    if context.role.lower() not in ("owner", "admin"):
        if context.allowed_shop_ids:
            query = query.filter(
                or_(
                    Product.shop_id.in_(context.allowed_shop_ids),
                    Product.shop_id.is_(None),
                )
            )
        else:
            query = query.filter(Product.shop_id == -1)
    
    if batch_id:
        query = query.filter(Product.ingest_batch_id == batch_id)
    
    products = query.all()
    
    # Filter products with issues
    problem_products = []
    for product in products:
        issues = []
        
        # Check for missing required fields
        if not product.title_raw or len(product.title_raw) < 1:
            issues.append("Missing title")
        if not product.description_raw or len(product.description_raw) < 1:
            issues.append("Missing description")
        if not product.price or product.price <= 0:
            issues.append("Missing or invalid price")
        if not product.quantity or product.quantity < 0:
            issues.append("Missing or invalid quantity")
        if not product.tags_raw or len(product.tags_raw) == 0:
            issues.append("Missing tags")
        
        if issues:
            problem_products.append({
                "product": product,
                "issues": "; ".join(issues)
            })
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Product ID", "SKU", "Title", "Description", "Price", "Quantity", 
        "Tags", "Source", "Batch ID", "Issues", "Created At"
    ])
    
    # Data rows
    for item in problem_products:
        product = item["product"]
        writer.writerow([
            product.id,
            product.sku or "",
            product.title_raw or "",
            (product.description_raw or "")[:100] + "..." if product.description_raw and len(product.description_raw) > 100 else product.description_raw or "",
            f"{product.price / 100:.2f}" if product.price else "",
            product.quantity or "",
            "|".join(product.tags_raw) if product.tags_raw else "",
            product.source or "",
            product.ingest_batch_id or "",
            item["issues"],
            product.created_at.isoformat() if product.created_at else ""
        ])
    
    # Return as downloadable CSV
    output.seek(0)
    filename = f"problem_products_{batch_id or 'all'}_{int(datetime.now(timezone.utc).timestamp())}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/sync/etsy", tags=["Products"])
async def sync_products_from_shop(
    shop_id: Optional[int] = Query(None, description="Shop ID to sync products from (query or body)"),
    body: Optional[SyncEtsyBody] = None,
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Trigger a sync of Etsy listings into products for a specific shop.
    Requires: CREATE_PRODUCT permission (Owner, Admin, Creator)
    Accepts shop_id via query (?shop_id=9) or JSON body ({"shop_id": 9}).
    """
    resolved_shop_id = shop_id if shop_id is not None else (body.shop_id if body else None)
    if resolved_shop_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="shop_id is required (query or body)",
        )
    try:
        ensure_shop_access(resolved_shop_id, context, db)
        task = sync_products_from_etsy.delay(shop_id=resolved_shop_id, tenant_id=context.tenant_id)
        logger.info("Queued Etsy product sync task %s for shop_id=%s tenant_id=%s", task.id, resolved_shop_id, context.tenant_id)
        return {"message": "Etsy product sync started", "shop_id": resolved_shop_id, "task_id": task.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "sync_products_from_shop failed: %s\n%s",
            e,
            traceback.format_exc(),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/", tags=["Products"])
async def list_products(
    skip: int = 0,
    limit: int = 50,
    batch_id: Optional[str] = None,
    shop_id: Optional[int] = None,
    shop_ids: Optional[str] = None,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    List all products for current tenant
    Requires: READ_PRODUCT permission (all roles)
    Supports: shop_id (single) or shop_ids (comma-separated) for multi-shop filtering
    Suppliers/viewers see only products from shops assigned to them.
    """
    # Filter by tenant
    query = filter_by_tenant(db.query(Product), context.tenant_id, Product.tenant_id)
    
    # Suppliers/viewers: products in assigned shops OR tenant-wide (shop_id null)
    if context.role.lower() not in ("owner", "admin"):
        if context.allowed_shop_ids:
            query = query.filter(
                or_(
                    Product.shop_id.in_(context.allowed_shop_ids),
                    Product.shop_id.is_(None),
                )
            )
        else:
            query = query.filter(Product.shop_id == -1)  # No access
    
    if batch_id:
        query = query.filter(Product.ingest_batch_id == batch_id)

    if shop_ids:
        ids = [int(x) for x in shop_ids.split(',') if x.strip().isdigit()]
        for sid in ids:
            ensure_shop_access(sid, context, db)
        if ids:
            # Include products with shop_id in selected shops OR shop_id=null (manual/CSV imports)
            query = query.filter(or_(Product.shop_id.in_(ids), Product.shop_id.is_(None)))
    elif shop_id:
        ensure_shop_access(shop_id, context, db)
        # Include products with this shop OR shop_id=null (manual/CSV imports)
        query = query.filter(or_(Product.shop_id == shop_id, Product.shop_id.is_(None)))
    
    total = query.count()
    products = query.offset(skip).limit(limit).all()
    
    return {
        "products": [
            {
                "id": p.id,
                "shop_id": p.shop_id,
                "etsy_listing_id": p.etsy_listing_id,
                "title_raw": p.title_raw,
                "description_raw": p.description_raw,
                "tags_raw": p.tags_raw,
                "images": p.images,
                "price": p.price,
                "cost_usd_cents": getattr(p, "cost_usd_cents", 0) or 0,
                "views": getattr(p, "views", 0) or 0,
                "source": p.source,
                "batch_id": p.ingest_batch_id,
                "created_at": p.created_at.isoformat()
            }
            for p in products
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{product_id}", tags=["Products"])
async def get_product(
    product_id: int,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Get single product details
    Requires: READ_PRODUCT permission (all roles)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Ensure tenant access (defense in depth)
    ensure_tenant_access(product.tenant_id, context)

    # Suppliers can access products in assigned shops or tenant-wide (shop_id null)
    if context.role.lower() in ("supplier", "viewer"):
        if product.shop_id is not None:
            ensure_shop_access(product.shop_id, context, db)

    return {
        "id": product.id,
        "shop_id": product.shop_id,
        "etsy_listing_id": product.etsy_listing_id,
        "title_raw": product.title_raw,
        "description_raw": product.description_raw,
        "tags_raw": product.tags_raw,
        "images": product.images,
        "variants": product.variants,
        "price": product.price,
        "taxonomy_id": getattr(product, "taxonomy_id", None),
        "who_made": getattr(product, "who_made", None),
        "when_made": getattr(product, "when_made", None),
        "materials": getattr(product, "materials", None),
        "cost_usd_cents": getattr(product, "cost_usd_cents", 0) or 0,
        "source": product.source,
        "batch_id": product.ingest_batch_id,
        "created_at": product.created_at.isoformat(),
    }


@router.put("/{product_id}", tags=["Products"])
async def update_product(
    product_id: int,
    request: ProductImportRequest,
    context: UserContext = Depends(require_permission(Permission.UPDATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Update an existing product.
    Requires: UPDATE_PRODUCT permission (Creator+)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Update fields
    product.title_raw = request.title_raw
    product.description_raw = request.description_raw
    product.tags_raw = request.tags_raw
    product.images = request.images
    product.variants = request.variants
    if request.cost_usd_cents is not None:
        product.cost_usd_cents = max(0, request.cost_usd_cents)
    product.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(product)
    
    return {
        "message": "Product updated successfully",
        "product_id": product.id
    }


@router.delete("/{product_id}", tags=["Products"])
async def delete_product(
    product_id: int,
    context: UserContext = Depends(require_permission(Permission.DELETE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Delete a product
    Requires: DELETE_PRODUCT permission (Owner, Admin only)
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == context.tenant_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Ensure tenant access (defense in depth)
    ensure_tenant_access(product.tenant_id, context)
    
    db.delete(product)
    db.commit()
    
    return {"message": "Product deleted successfully"}