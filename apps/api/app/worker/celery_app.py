"""
Celery Application Configuration
Background task worker for async operations
"""
from celery import Celery
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Suppress verbose SQLAlchemy logs in worker context
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.orm").setLevel(logging.WARNING)

# Create Celery app
celery_app = Celery(
    "etsy_automation",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.worker.tasks.order_tasks",
        "app.worker.tasks.token_tasks",
        "app.worker.tasks.ingestion_tasks",
        "app.worker.tasks.product_sync_tasks",
        "app.worker.tasks.financial_tasks",
        "app.worker.tasks.exchange_rate_tasks",
        "app.worker.tasks.messaging",
    ]
)

# Setup Celery metrics collection
try:
    from app.observability.celery_metrics import setup_celery_metrics
    setup_celery_metrics(celery_app)
    logger.info("✅ Celery metrics enabled")
except ImportError as e:
    logger.warning(f"⚠️ Celery metrics not available: {e}")

# Setup Celery Sentry integration
try:
    from app.core.sentry_config import initialize_sentry
    from app.observability.celery_sentry import setup_celery_sentry
    initialize_sentry()
    setup_celery_sentry(celery_app)
    logger.info("✅ Celery Sentry integration enabled")
except ImportError as e:
    logger.warning(f"⚠️ Celery Sentry not available: {e}")

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per task
    task_soft_time_limit=240,  # Soft limit at 4 minutes
    worker_prefetch_multiplier=1,  # One task at a time for rate limiting
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks
    task_acks_late=True,  # Acknowledge task after completion
    task_reject_on_worker_lost=True,
    result_expires=3600,  # Results expire after 1 hour
)

# Periodic tasks (Celery Beat schedule)
celery_app.conf.beat_schedule = {
    "refresh-tokens-every-hour": {
        "task": "app.worker.tasks.token_tasks.refresh_expiring_tokens",
        "schedule": 3600.0,  # Every hour
    },
    "sync-orders-every-2-minutes": {
        "task": "app.worker.tasks.order_tasks.sync_orders",
        "schedule": 120.0,  # Every 2 minutes — commercial rate limits allow this
    },
    "reconcile-orders-hourly": {
        "task": "app.worker.tasks.order_tasks.reconcile_orders",
        "schedule": 3600.0,  # Every hour
    },
    "sync-ledger-entries-hourly": {
        "task": "app.worker.tasks.financial_tasks.sync_ledger_entries",
        "schedule": 3600.0,  # Every hour — incremental, picks up new entries
    },
    "fetch-daily-exchange-rates": {
        "task": "app.worker.tasks.exchange_rate_tasks.fetch_daily_exchange_rates",
        "schedule": 86400.0,  # Every 24 hours (daily)
    },
    "check-adspower-health": {
        "task": "app.worker.tasks.messaging.check_adspower_health",
        "schedule": 1800.0,
    },
}
