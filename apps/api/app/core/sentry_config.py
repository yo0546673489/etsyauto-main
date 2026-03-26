"""
Sentry Configuration for Error Tracking
Includes PII scrubbing, context tagging, and secret redaction
"""
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
from sentry_sdk.integrations.redis import RedisIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
import logging
import os
from typing import Optional, Dict, Any

from app.core.config import settings
from app.core.redaction import (
    SENSITIVE_KEYS,
    PII_KEYS,
    scrub_sensitive_data,
    scrub_pii,
    scrub_all,
)


def before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Hook called before sending event to Sentry
    Used for scrubbing sensitive data and adding context
    
    Args:
        event: Sentry event dictionary
        hint: Additional context hints
    
    Returns:
        Modified event or None to drop the event
    """
    # Scrub request data
    if 'request' in event:
        if 'data' in event['request']:
            event['request']['data'] = scrub_all(event['request']['data'])
        
        if 'headers' in event['request']:
            event['request']['headers'] = scrub_all(event['request']['headers'])
        
        if 'cookies' in event['request']:
            event['request']['cookies'] = scrub_all(event['request']['cookies'])
        
        if 'query_string' in event['request']:
            event['request']['query_string'] = scrub_all(event['request']['query_string'])
    
    # Scrub extra context
    if 'extra' in event:
        event['extra'] = scrub_all(event['extra'])
    
    # Scrub breadcrumbs
    if 'breadcrumbs' in event:
        for breadcrumb in event['breadcrumbs']:
            if 'data' in breadcrumb:
                breadcrumb['data'] = scrub_all(breadcrumb['data'])
    
    # Scrub exception context
    if 'exception' in event:
        for exception in event['exception'].get('values', []):
            if 'stacktrace' in exception:
                for frame in exception['stacktrace'].get('frames', []):
                    if 'vars' in frame:
                        frame['vars'] = scrub_all(frame['vars'])
    
    return event


def before_breadcrumb(crumb: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Hook called before adding breadcrumb
    Used for filtering and scrubbing breadcrumbs
    
    Args:
        crumb: Breadcrumb data
        hint: Additional context
    
    Returns:
        Modified breadcrumb or None to drop it
    """
    # Scrub sensitive data from breadcrumb
    if 'data' in crumb:
        crumb['data'] = scrub_all(crumb['data'])
    
    # Don't log sensitive HTTP headers
    if crumb.get('category') == 'httplib' and 'data' in crumb:
        if 'Authorization' in crumb['data'].get('headers', {}):
            crumb['data']['headers']['Authorization'] = '[REDACTED]'
    
    return crumb


def initialize_sentry():
    """
    Initialize Sentry SDK with all integrations and configuration
    """
    sentry_dsn = os.getenv('SENTRY_DSN')
    
    if not sentry_dsn:
        logging.warning("⚠️  SENTRY_DSN not configured - Sentry disabled")
        return
    
    environment = os.getenv('ENVIRONMENT', 'development')
    release = os.getenv('RELEASE_VERSION', 'unknown')
    
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=environment,
        release=f"etsy-automation@{release}",
        
        # Integrations
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
            RedisIntegration(),
            CeleryIntegration(),
            LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR
            ),
        ],
        
        # Sample rate (1.0 = 100% of errors)
        traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        
        # Performance monitoring
        profiles_sample_rate=float(os.getenv('SENTRY_PROFILES_SAMPLE_RATE', '0.1')),
        
        # Scrubbing hooks
        before_send=before_send,
        before_breadcrumb=before_breadcrumb,
        
        # Send default PII (we'll scrub it ourselves)
        send_default_pii=False,
        
        # Max breadcrumbs to keep
        max_breadcrumbs=50,
        
        # Attach stacktraces
        attach_stacktrace=True,
        
        # Don't capture OPTIONS requests
        ignore_errors=[
            "werkzeug.exceptions.NotFound",
        ],
    )
    
    logging.info(f"✅ Sentry initialized (environment: {environment}, release: {release})")


def set_sentry_context(
    tenant_id: Optional[int] = None,
    shop_id: Optional[int] = None,
    user_id: Optional[int] = None,
    request_id: Optional[str] = None,
    job_id: Optional[int] = None,
    **extra_context
):
    """
    Set Sentry context tags and user info
    
    Args:
        tenant_id: Tenant ID
        shop_id: Shop ID
        user_id: User ID
        request_id: Request correlation ID
        job_id: Celery job ID
        **extra_context: Additional context to add
    """
    # Set tags
    if tenant_id is not None:
        sentry_sdk.set_tag("tenant_id", str(tenant_id))
    
    if shop_id is not None:
        sentry_sdk.set_tag("shop_id", str(shop_id))
    
    if request_id is not None:
        sentry_sdk.set_tag("request_id", request_id)
    
    if job_id is not None:
        sentry_sdk.set_tag("job_id", str(job_id))
    
    # Set user context (no PII)
    if user_id is not None:
        sentry_sdk.set_user({"id": str(user_id)})
    
    # Set extra context
    for key, value in extra_context.items():
        sentry_sdk.set_context(key, scrub_sensitive_data(value))


def capture_exception_with_context(
    exception: Exception,
    tenant_id: Optional[int] = None,
    shop_id: Optional[int] = None,
    user_id: Optional[int] = None,
    request_id: Optional[str] = None,
    job_id: Optional[int] = None,
    **extra_context
):
    """
    Capture exception with full context
    
    Args:
        exception: Exception to capture
        tenant_id: Tenant ID
        shop_id: Shop ID
        user_id: User ID
        request_id: Request ID
        job_id: Job ID
        **extra_context: Additional context
    """
    # Set context
    set_sentry_context(
        tenant_id=tenant_id,
        shop_id=shop_id,
        user_id=user_id,
        request_id=request_id,
        job_id=job_id,
        **extra_context
    )
    
    # Capture exception
    sentry_sdk.capture_exception(exception)


def add_breadcrumb(
    message: str,
    category: str = "custom",
    level: str = "info",
    data: Optional[Dict] = None
):
    """
    Add a breadcrumb to Sentry
    
    Args:
        message: Breadcrumb message
        category: Breadcrumb category
        level: Log level (info, warning, error)
        data: Additional data (will be scrubbed)
    """
    scrubbed_data = scrub_sensitive_data(data) if data else {}
    
    sentry_sdk.add_breadcrumb(
        message=message,
        category=category,
        level=level,
        data=scrubbed_data
    )


def capture_message_with_context(
    message: str,
    level: str = "info",
    tenant_id: Optional[int] = None,
    shop_id: Optional[int] = None,
    **extra_context
):
    """
    Capture a message with context
    
    Args:
        message: Message to capture
        level: Log level
        tenant_id: Tenant ID
        shop_id: Shop ID
        **extra_context: Additional context
    """
    set_sentry_context(tenant_id=tenant_id, shop_id=shop_id, **extra_context)
    sentry_sdk.capture_message(message, level=level)

