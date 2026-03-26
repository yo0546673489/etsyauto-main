"""
Celery Tasks for Product Ingestion
Handles background processing of product ingestion batches
"""
import logging
import json
from datetime import datetime
from typing import Dict, Any

from celery import Task
from sqlalchemy.orm import Session

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.ingestion import IngestionBatch
from app.models.products import Product
from app.services.ingestion_service import IngestionService
from app.services.error_report_service import ErrorReportService
from app.services.notification_service import notify_tenant_admins
from app.models.notifications import NotificationType

logger = logging.getLogger(__name__)


class DatabaseTask(Task):
    """Base task with database session management"""
    _db: Session = None

    @property
    def db(self) -> Session:
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, *args, **kwargs):
        if self._db:
            self._db.close()
            self._db = None


@celery_app.task(
    bind=True,
    base=DatabaseTask,
    name="app.worker.tasks.ingestion_tasks.process_ingestion_batch",
    max_retries=3,
    default_retry_delay=60,
)
def process_ingestion_batch(self, batch_id: str) -> Dict[str, Any]:
    """
    Process an ingestion batch in the background
    
    Features:
    - Validates all rows using Pydantic schemas
    - Collects per-row errors
    - Saves valid products to database
    - Generates error reports (CSV/JSON)
    - Updates batch status and metadata
    
    Args:
        batch_id: Batch ID to process
        
    Returns:
        dict: Processing result with statistics
    """
    db = self.db
    
    try:
        # Load batch
        batch = db.query(IngestionBatch).filter(
            IngestionBatch.batch_id == batch_id
        ).first()
        
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")
        
        # Update status to processing
        batch.status = 'processing'
        batch.started_at = datetime.utcnow()
        db.commit()
        
        # Initialize services
        ingestion_service = IngestionService(db)
        error_report_service = ErrorReportService()
        
        # Parse raw data based on file type
        if batch.file_type == 'csv':
            csv_content = json.loads(batch.raw_data) if isinstance(batch.raw_data, str) else batch.raw_data.get('content', '')
            rows, total_rows = ingestion_service.parse_csv(csv_content, batch.filename or '')
        elif batch.file_type == 'json':
            json_content = json.loads(batch.raw_data) if isinstance(batch.raw_data, str) else json.dumps(batch.raw_data.get('content', {}))
            rows, total_rows = ingestion_service.parse_json(json_content, batch.filename or '')
        else:
            raise ValueError(f"Unsupported file type: {batch.file_type}")
        
        # Update total rows
        batch.total_rows = total_rows
        db.commit()
        
        # Validate all rows
        validated_products, error_reports = ingestion_service.validate_batch(rows)
        
        # Save valid products
        saved_count = 0
        if validated_products:
            saved_count = ingestion_service.save_products(
                validated_products=validated_products,
                tenant_id=batch.tenant_id,
                shop_id=batch.shop_id,
                batch_id=batch_id,
                source=batch.file_type
            )
        
        # Generate error reports if there are errors
        error_report_path = None
        error_report_url = None
        
        if error_reports:
            try:
                if batch.file_type == 'csv':
                    error_report_path, error_report_url = error_report_service.generate_csv_report(
                        error_reports, batch_id
                    )
                else:
                    error_report_path, error_report_url = error_report_service.generate_json_report(
                        error_reports, batch_id
                    )
            except Exception as e:
                logger.error(f"Error generating error report: {str(e)}")
        
        # Update batch status
        batch.status = 'completed' if error_reports == [] else 'completed'
        batch.successful_rows = saved_count
        batch.failed_rows = len(error_reports)
        batch.error_report_path = error_report_path
        batch.error_report_url = error_report_url
        batch.completed_at = datetime.utcnow()
        
        # Clear raw_data to save space (already processed)
        batch.raw_data = None
        
        db.commit()
        
        logger.info(f"Batch {batch_id} processed: {saved_count} successful, {len(error_reports)} failed")
        
        return {
            'batch_id': batch_id,
            'status': 'completed',
            'total_rows': total_rows,
            'successful_rows': saved_count,
            'failed_rows': len(error_reports),
            'error_report_url': error_report_url
        }
        
    except Exception as e:
        logger.error(f"Error processing batch {batch_id}: {str(e)}", exc_info=True)

        # Update batch status to failed
        try:
            batch = db.query(IngestionBatch).filter(
                IngestionBatch.batch_id == batch_id
            ).first()
            if batch:
                batch.status = 'failed'
                batch.error_message = str(e)
                batch.completed_at = datetime.utcnow()
                db.commit()
                try:
                    notify_tenant_admins(
                        db=db,
                        tenant_id=batch.tenant_id,
                        notification_type=NotificationType.ERROR,
                        title="Product import failed",
                        message=f"Batch import \"{batch.filename or batch_id}\" failed: {e}",
                        action_url="/products",
                        action_label="View products",
                    )
                except Exception:
                    pass
        except Exception as commit_error:
            logger.error(f"Error updating batch status: {str(commit_error)}")

        # Retry if not exceeded max retries
        raise self.retry(exc=e)

