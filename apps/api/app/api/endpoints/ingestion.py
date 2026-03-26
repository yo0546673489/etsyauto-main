"""
Product Ingestion API Endpoints
Handle CSV/JSON uploads and batch processing
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.api.dependencies import get_user_context, UserContext, require_permission
from app.core.rbac import Permission
from app.core.query_helpers import ensure_tenant_access
from app.models.ingestion import IngestionBatch
from app.schemas.ingestion import (
    IngestionBatchResponse,
    IngestionUploadResponse,
    IngestionStatusResponse
)
from app.worker.tasks.ingestion_tasks import process_ingestion_batch
from app.services.error_report_service import ErrorReportService

router = APIRouter()


@router.post("/upload/csv", tags=["Product Ingestion"], response_model=IngestionUploadResponse)
async def upload_csv_batch(
    file: UploadFile = File(...),
    shop_id: Optional[int] = None,
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Upload CSV file for product ingestion
    Requires: CREATE_PRODUCT permission (Owner, Admin, Creator)
    
    CSV Format:
    - Required: title
    - Optional: sku, description, price, quantity, tags, images, variants
    
    The batch will be processed in the background.
    """
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV file"
        )
    
    # Read file content with size limit
    try:
        contents = await file.read()
        if len(contents) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds the {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB limit"
            )
        csv_content = contents.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be valid UTF-8 encoded CSV"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}"
        )

    # Pre-validate CSV structure and sanitize cells (formula injection prevention)
    from app.services.csv_validator import validate_and_sanitize_csv
    _valid_rows, csv_errors = validate_and_sanitize_csv(csv_content)
    if csv_errors and not _valid_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "CSV validation failed — no valid rows found",
                "errors": csv_errors[:50],
            }
        )

    # Verify shop access if shop_id provided
    if shop_id:
        from app.core.query_helpers import ensure_shop_access
        ensure_shop_access(shop_id, context, db)
    
    # Generate batch ID
    batch_id = f"batch_{uuid.uuid4().hex[:16]}_{int(datetime.now(timezone.utc).timestamp())}"
    
    # Create batch record
    batch = IngestionBatch(
        tenant_id=context.tenant_id,
        shop_id=shop_id,
        batch_id=batch_id,
        filename=file.filename,
        file_type='csv',
        status='pending',
        source='upload',
        raw_data=json.dumps({'content': csv_content})  # Store for processing
    )
    
    db.add(batch)
    db.commit()
    db.refresh(batch)
    
    # Trigger background processing
    try:
        process_ingestion_batch.delay(batch_id)
    except Exception as e:
        # Update batch status if task fails to queue
        batch.status = 'failed'
        batch.error_message = f"Failed to queue processing: {str(e)}"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start batch processing: {str(e)}"
        )
    
    return IngestionUploadResponse(
        batch_id=batch_id,
        message="File uploaded successfully. Processing started in background.",
        status='pending'
    )


@router.post("/upload/json", tags=["Product Ingestion"], response_model=IngestionUploadResponse)
async def upload_json_batch(
    file: UploadFile = File(...),
    shop_id: Optional[int] = None,
    context: UserContext = Depends(require_permission(Permission.CREATE_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Upload JSON file for product ingestion
    Requires: CREATE_PRODUCT permission (Owner, Admin, Creator)
    
    JSON Format:
    - Array of products: [{"title": "...", ...}, ...]
    - Or object with 'products' key: {"products": [{"title": "...", ...}, ...]}
    
    The batch will be processed in the background.
    """
    if not file.filename or not file.filename.endswith('.json'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a JSON file"
        )
    
    # Read file content with size limit
    try:
        contents = await file.read()
        if len(contents) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds the {settings.MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB limit"
            )
        json_content = contents.decode('utf-8')
        # Validate JSON
        json.loads(json_content)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON format: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to read file"
        )
    
    # Verify shop access if shop_id provided
    if shop_id:
        from app.core.query_helpers import ensure_shop_access
        ensure_shop_access(shop_id, context, db)
    
    # Generate batch ID
    batch_id = f"batch_{uuid.uuid4().hex[:16]}_{int(datetime.now(timezone.utc).timestamp())}"
    
    # Create batch record
    batch = IngestionBatch(
        tenant_id=context.tenant_id,
        shop_id=shop_id,
        batch_id=batch_id,
        filename=file.filename,
        file_type='json',
        status='pending',
        source='upload',
        raw_data=json.dumps({'content': json_content})  # Store for processing
    )
    
    db.add(batch)
    db.commit()
    db.refresh(batch)
    
    # Trigger background processing
    try:
        process_ingestion_batch.delay(batch_id)
    except Exception as e:
        # Update batch status if task fails to queue
        batch.status = 'failed'
        batch.error_message = f"Failed to queue processing: {str(e)}"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start batch processing: {str(e)}"
        )
    
    return IngestionUploadResponse(
        batch_id=batch_id,
        message="File uploaded successfully. Processing started in background.",
        status='pending'
    )


@router.get("/batch/{batch_id}/status", tags=["Product Ingestion"], response_model=IngestionStatusResponse)
async def get_batch_status(
    batch_id: str,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Get status of an ingestion batch
    Requires: READ_PRODUCT permission (all roles)
    """
    batch = db.query(IngestionBatch).filter(
        IngestionBatch.batch_id == batch_id,
        IngestionBatch.tenant_id == context.tenant_id
    ).first()
    
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found"
        )
    
    ensure_tenant_access(batch.tenant_id, context)
    
    # Calculate progress
    progress = 0.0
    if batch.total_rows > 0:
        progress = ((batch.successful_rows + batch.failed_rows) / batch.total_rows) * 100.0
    
    return IngestionStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_rows=batch.total_rows,
        successful_rows=batch.successful_rows,
        failed_rows=batch.failed_rows,
        progress_percent=progress,
        error_report_url=batch.error_report_url,
        error_message=batch.error_message,
        created_at=batch.created_at,
        started_at=batch.started_at,
        completed_at=batch.completed_at
    )


@router.get("/batch/{batch_id}", tags=["Product Ingestion"], response_model=IngestionBatchResponse)
async def get_batch(
    batch_id: str,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Get batch details
    Requires: READ_PRODUCT permission (all roles)
    """
    batch = db.query(IngestionBatch).filter(
        IngestionBatch.batch_id == batch_id,
        IngestionBatch.tenant_id == context.tenant_id
    ).first()
    
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found"
        )
    
    ensure_tenant_access(batch.tenant_id, context)
    
    return IngestionBatchResponse(
        id=batch.id,
        batch_id=batch.batch_id,
        filename=batch.filename,
        file_type=batch.file_type,
        status=batch.status,
        total_rows=batch.total_rows,
        successful_rows=batch.successful_rows,
        failed_rows=batch.failed_rows,
        error_report_url=batch.error_report_url,
        error_message=batch.error_message,
        created_at=batch.created_at,
        started_at=batch.started_at,
        completed_at=batch.completed_at
    )


@router.get("/batch", tags=["Product Ingestion"])
async def list_batches(
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    List all ingestion batches for current tenant
    Requires: READ_PRODUCT permission (all roles)
    """
    from app.core.query_helpers import filter_by_tenant
    
    query = filter_by_tenant(
        db.query(IngestionBatch),
        context.tenant_id,
        IngestionBatch.tenant_id
    )
    
    if status:
        query = query.filter(IngestionBatch.status == status)
    
    total = query.count()
    batches = query.order_by(IngestionBatch.created_at.desc()).offset(skip).limit(limit).all()
    
    return {
        "batches": [
            {
                "id": batch.id,
                "batch_id": batch.batch_id,
                "filename": batch.filename,
                "file_type": batch.file_type,
                "status": batch.status,
                "total_rows": batch.total_rows,
                "successful_rows": batch.successful_rows,
                "failed_rows": batch.failed_rows,
                "created_at": batch.created_at.isoformat() if batch.created_at else None,
                "completed_at": batch.completed_at.isoformat() if batch.completed_at else None,
            }
            for batch in batches
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/errors/{batch_id}", tags=["Product Ingestion"])
async def download_error_report(
    batch_id: str,
    format: str = "csv",
    context: UserContext = Depends(require_permission(Permission.READ_PRODUCT)),
    db: Session = Depends(get_db)
):
    """
    Download error report for a batch
    Requires: READ_PRODUCT permission (all roles)
    
    Args:
        batch_id: Batch ID
        format: Report format ('csv' or 'json')
    """
    batch = db.query(IngestionBatch).filter(
        IngestionBatch.batch_id == batch_id,
        IngestionBatch.tenant_id == context.tenant_id
    ).first()
    
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found"
        )
    
    ensure_tenant_access(batch.tenant_id, context)
    
    if not batch.error_report_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Error report not available for this batch"
        )
    
    # Return file
    import os
    if os.path.exists(batch.error_report_path):
        media_type = 'text/csv' if format == 'csv' else 'application/json'
        return FileResponse(
            batch.error_report_path,
            media_type=media_type,
            filename=f"errors_{batch_id}.{format}"
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Error report file not found"
        )

