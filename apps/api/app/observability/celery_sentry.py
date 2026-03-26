"""
Sentry Integration for Celery Workers
Captures task failures with context and argument redaction
"""
import logging
from celery import signals
from typing import Any, Dict

from app.core.sentry_config import (
    set_sentry_context,
    capture_exception_with_context,
    add_breadcrumb,
    scrub_sensitive_data
)

logger = logging.getLogger(__name__)


def setup_celery_sentry(celery_app):
    """
    Setup Sentry error tracking for Celery tasks
    
    Args:
        celery_app: Celery application instance
    """
    
    @signals.task_prerun.connect
    def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
        """Set Sentry context when task starts"""
        task_name = task.name if task else "unknown"
        
        # Extract context from task kwargs
        tenant_id = kwargs.get('tenant_id') if kwargs else None
        shop_id = kwargs.get('shop_id') if kwargs else None
        job_id = kwargs.get('job_id') if kwargs else None
        
        # Set Sentry context
        set_sentry_context(
            tenant_id=tenant_id,
            shop_id=shop_id,
            job_id=job_id,
            task_id=task_id,
            task_name=task_name
        )
        
        # Add breadcrumb
        add_breadcrumb(
            message=f"Task started: {task_name}",
            category="celery",
            level="info",
            data={
                "task_id": task_id,
                "task_name": task_name,
                # Redact sensitive args/kwargs
                "args": scrub_sensitive_data(list(args)) if args else [],
                "kwargs": scrub_sensitive_data(dict(kwargs)) if kwargs else {}
            }
        )
    
    @signals.task_failure.connect
    def task_failure_handler(sender=None, task_id=None, exception=None, args=None, kwargs=None, **extra):
        """Capture task failures in Sentry"""
        task_name = sender.name if sender else "unknown"
        
        # Extract context
        tenant_id = kwargs.get('tenant_id') if kwargs else None
        shop_id = kwargs.get('shop_id') if kwargs else None
        job_id = kwargs.get('job_id') if kwargs else None
        
        # Add failure breadcrumb
        add_breadcrumb(
            message=f"Task failed: {task_name}",
            category="celery",
            level="error",
            data={
                "task_id": task_id,
                "task_name": task_name,
                "exception": str(exception),
                "args": scrub_sensitive_data(list(args)) if args else [],
                "kwargs": scrub_sensitive_data(dict(kwargs)) if kwargs else {}
            }
        )
        
        # Capture exception with full context
        capture_exception_with_context(
            exception=exception,
            tenant_id=tenant_id,
            shop_id=shop_id,
            job_id=job_id,
            task_id=task_id,
            task_name=task_name,
            task_args=scrub_sensitive_data(list(args)) if args else [],
            task_kwargs=scrub_sensitive_data(dict(kwargs)) if kwargs else {}
        )
        
        logger.error(
            f"Celery task failed: {task_name} (task_id={task_id})",
            exc_info=exception,
            extra={
                "tenant_id": tenant_id,
                "shop_id": shop_id,
                "job_id": job_id,
                "task_id": task_id
            }
        )
    
    @signals.task_retry.connect
    def task_retry_handler(sender=None, task_id=None, reason=None, **extra):
        """Track task retries in Sentry"""
        task_name = sender.name if sender else "unknown"
        retry_count = sender.request.retries if hasattr(sender, 'request') else 0
        
        add_breadcrumb(
            message=f"Task retry #{retry_count}: {task_name}",
            category="celery",
            level="warning",
            data={
                "task_id": task_id,
                "task_name": task_name,
                "retry_count": retry_count,
                "reason": str(reason)
            }
        )
    
    @signals.task_success.connect
    def task_success_handler(sender=None, result=None, **extra):
        """Add success breadcrumb"""
        task_name = sender.name if sender else "unknown"
        
        add_breadcrumb(
            message=f"Task completed: {task_name}",
            category="celery",
            level="info",
            data={
                "task_name": task_name,
                "result": scrub_sensitive_data(result) if isinstance(result, dict) else None
            }
        )
    
    logger.info("✅ Celery Sentry integration enabled")

