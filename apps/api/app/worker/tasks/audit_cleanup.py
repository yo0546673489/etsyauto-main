"""
Audit Log Cleanup Task
Removes audit logs older than 30 days (TTL enforcement)
"""
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import delete

from app.worker.celery_app import celery_app
from app.core.database import get_db
from app.models.audit import AuditLog

logger = logging.getLogger(__name__)


@celery_app.task(name="audit.cleanup_old_logs", max_retries=3)
def cleanup_old_audit_logs():
    """
    Delete audit logs older than 30 days
    Runs daily via Celery beat
    
    Returns:
        dict: Cleanup statistics
    """
    db = next(get_db())
    
    try:
        # Calculate cutoff date (30 days ago)
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
        
        # Count logs to be deleted
        logs_to_delete = db.query(AuditLog).filter(
            AuditLog.created_at < cutoff_date
        ).count()
        
        if logs_to_delete > 0:
            # Delete old logs
            result = db.execute(
                delete(AuditLog).where(AuditLog.created_at < cutoff_date)
            )
            db.commit()
            
            deleted_count = result.rowcount
            
            logger.info(f"Deleted {deleted_count} audit logs older than {cutoff_date.date()}")
            
            return {
                "success": True,
                "deleted_count": deleted_count,
                "cutoff_date": cutoff_date.isoformat(),
                "message": f"Deleted {deleted_count} audit logs older than 30 days"
            }
        else:
            print("✅ No old audit logs to clean up")
            return {
                "success": True,
                "deleted_count": 0,
                "cutoff_date": cutoff_date.isoformat(),
                "message": "No audit logs older than 30 days found"
            }
    
    except Exception as e:
        db.rollback()
        logger.error(f"Audit cleanup failed: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "message": "Audit log cleanup failed"
        }
    
    finally:
        db.close()


@celery_app.task(name="audit.get_retention_stats", max_retries=3)
def get_audit_retention_stats():
    """
    Get statistics about audit log retention
    Useful for monitoring
    
    Returns:
        dict: Retention statistics
    """
    db = next(get_db())
    
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
        
        # Total logs
        total_logs = db.query(AuditLog).count()
        
        # Logs within retention period
        logs_within_retention = db.query(AuditLog).filter(
            AuditLog.created_at >= cutoff_date
        ).count()
        
        # Logs beyond retention (should be 0 after cleanup)
        logs_beyond_retention = db.query(AuditLog).filter(
            AuditLog.created_at < cutoff_date
        ).count()
        
        # Oldest log
        oldest_log = db.query(AuditLog).order_by(AuditLog.created_at.asc()).first()
        oldest_date = oldest_log.created_at if oldest_log else None
        
        # Newest log
        newest_log = db.query(AuditLog).order_by(AuditLog.created_at.desc()).first()
        newest_date = newest_log.created_at if newest_log else None
        
        return {
            "total_logs": total_logs,
            "logs_within_retention": logs_within_retention,
            "logs_beyond_retention": logs_beyond_retention,
            "retention_days": 30,
            "cutoff_date": cutoff_date.isoformat(),
            "oldest_log_date": oldest_date.isoformat() if oldest_date else None,
            "newest_log_date": newest_date.isoformat() if newest_date else None,
        }
    
    finally:
        db.close()

