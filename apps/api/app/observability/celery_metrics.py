"""
Celery Metrics Integration
Tracks Celery task execution and queue metrics
"""
import logging
from celery import signals
from celery.app import task as celery_task
from typing import Any

from app.observability.metrics import (
    celery_task_sent_total,
    celery_task_started_total,
    celery_task_succeeded_total,
    celery_task_failed_total,
    celery_task_retried_total,
    celery_task_duration_seconds,
    sanitize_tenant_id
)

logger = logging.getLogger(__name__)


def setup_celery_metrics(celery_app):
    """
    Setup Celery signal handlers for metrics collection
    
    Args:
        celery_app: Celery application instance
    """
    
    @signals.task_sent.connect
    def task_sent_handler(sender=None, task_id=None, task=None, **kwargs):
        """Track when a task is sent to the queue"""
        task_name = task or "unknown"
        tenant_id = sanitize_tenant_id(kwargs.get('kwargs', {}).get('tenant_id'))
        
        celery_task_sent_total.labels(
            task_name=task_name,
            tenant_id=tenant_id
        ).inc()
    
    @signals.task_prerun.connect
    def task_prerun_handler(sender=None, task_id=None, task=None, **kwargs):
        """Track when a task starts execution"""
        task_name = task.name if task else "unknown"
        tenant_id = sanitize_tenant_id(kwargs.get('kwargs', {}).get('tenant_id'))
        
        celery_task_started_total.labels(
            task_name=task_name,
            tenant_id=tenant_id
        ).inc()
        
        # Store start time for duration calculation
        task.request.start_time = kwargs.get('start_time')
    
    @signals.task_success.connect
    def task_success_handler(sender=None, result=None, **kwargs):
        """Track successful task completion"""
        task_name = sender.name if sender else "unknown"
        
        # Extract tenant_id from task kwargs or result
        tenant_id = "unknown"
        if hasattr(sender, 'request') and hasattr(sender.request, 'kwargs'):
            tenant_id = sanitize_tenant_id(sender.request.kwargs.get('tenant_id'))
        
        celery_task_succeeded_total.labels(
            task_name=task_name,
            tenant_id=tenant_id
        ).inc()
        
        # Record task duration
        if hasattr(sender, 'request') and hasattr(sender.request, 'start_time'):
            import time
            duration = time.time() - sender.request.start_time
            celery_task_duration_seconds.labels(
                task_name=task_name,
                tenant_id=tenant_id
            ).observe(duration)
    
    @signals.task_failure.connect
    def task_failure_handler(sender=None, task_id=None, exception=None, **kwargs):
        """Track failed tasks"""
        task_name = sender.name if sender else "unknown"
        error_type = type(exception).__name__ if exception else "unknown"
        
        # Extract tenant_id
        tenant_id = "unknown"
        if hasattr(sender, 'request') and hasattr(sender.request, 'kwargs'):
            tenant_id = sanitize_tenant_id(sender.request.kwargs.get('tenant_id'))
        
        celery_task_failed_total.labels(
            task_name=task_name,
            tenant_id=tenant_id,
            error_type=error_type
        ).inc()
        
        # Record task duration even for failures
        if hasattr(sender, 'request') and hasattr(sender.request, 'start_time'):
            import time
            duration = time.time() - sender.request.start_time
            celery_task_duration_seconds.labels(
                task_name=task_name,
                tenant_id=tenant_id
            ).observe(duration)
    
    @signals.task_retry.connect
    def task_retry_handler(sender=None, task_id=None, reason=None, **kwargs):
        """Track task retries"""
        task_name = sender.name if sender else "unknown"
        
        # Extract tenant_id and retry count
        tenant_id = "unknown"
        retry_count = "0"
        if hasattr(sender, 'request'):
            if hasattr(sender.request, 'kwargs'):
                tenant_id = sanitize_tenant_id(sender.request.kwargs.get('tenant_id'))
            retry_count = str(sender.request.retries)
        
        celery_task_retried_total.labels(
            task_name=task_name,
            tenant_id=tenant_id,
            retry_count=retry_count
        ).inc()
    
    logger.info("✅ Celery metrics handlers registered")


def get_celery_queue_metrics(celery_app) -> dict:
    """
    Get current Celery queue metrics
    
    Returns:
        dict: Queue metrics including depth, active workers, etc.
    """
    try:
        # Get queue stats
        inspect = celery_app.control.inspect()
        
        # Active tasks
        active = inspect.active()
        active_count = sum(len(tasks) for tasks in (active or {}).values())
        
        # Scheduled tasks
        scheduled = inspect.scheduled()
        scheduled_count = sum(len(tasks) for tasks in (scheduled or {}).values())
        
        # Reserved tasks
        reserved = inspect.reserved()
        reserved_count = sum(len(tasks) for tasks in (reserved or {}).values())
        
        # Active workers
        stats = inspect.stats()
        worker_count = len(stats or {})
        
        return {
            "active_tasks": active_count,
            "scheduled_tasks": scheduled_count,
            "reserved_tasks": reserved_count,
            "active_workers": worker_count,
            "total_queue_depth": active_count + scheduled_count + reserved_count
        }
    except Exception as e:
        logger.error(f"Failed to get Celery queue metrics: {e}")
        return {
            "active_tasks": 0,
            "scheduled_tasks": 0,
            "reserved_tasks": 0,
            "active_workers": 0,
            "total_queue_depth": 0
        }

