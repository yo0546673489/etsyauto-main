"""
Celery Tasks for OAuth Token Management
Scheduled token refresh and maintenance
"""
import asyncio
from datetime import datetime, timezone
from celery import Task
from sqlalchemy.orm import Session
import redis
import logging

from app.worker.celery_app import celery_app
from app.core.database import get_db_session
from app.core.config import settings
from app.services.token_manager import TokenManager
from app.models.tenancy import OAuthToken, Shop
from app.services.notification_service import notify_tenant_admins
from app.models.notifications import NotificationType

logger = logging.getLogger(__name__)


class DatabaseTask(Task):
    """Base task with database session"""
    _db: Session = None
    
    @property
    def db(self):
        if self._db is None:
            self._db = next(get_db_session())
        return self._db
    
    def after_return(self, *args, **kwargs):
        if self._db is not None:
            self._db.close()
            self._db = None


@celery_app.task(base=DatabaseTask, bind=True, max_retries=3)
def refresh_expiring_tokens(self):
    """
    Proactively refresh tokens expiring in the next 24 hours
    
    Runs every hour via Celery Beat
    """
    logger.info("Starting proactive token refresh task")
    
    try:
        # Create Redis client
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        
        # Create token manager
        token_manager = TokenManager(self.db, redis_client)
        
        # Get tokens expiring in next 24 hours
        expiring_tokens = asyncio.run(
            token_manager.get_tokens_expiring_soon(hours=24)
        )
        
        if not expiring_tokens:
            logger.info("No tokens expiring in the next 24 hours")
            return {
                "status": "success",
                "refreshed": 0,
                "failed": 0,
                "total": 0
            }
        
        logger.info(f"Found {len(expiring_tokens)} tokens expiring soon")
        
        refreshed = 0
        failed = 0
        
        for token in expiring_tokens:
            try:
                # Check if already refreshed recently (within last hour)
                if token.last_refreshed_at:
                    time_since_refresh = datetime.now(timezone.utc) - token.last_refreshed_at
                    if time_since_refresh.total_seconds() < 3600:
                        logger.info(f"Token for shop {token.shop_id} refreshed recently, skipping")
                        continue
                
                logger.info(f"Refreshing token for shop {token.shop_id} (expires at {token.expires_at})")
                
                # Refresh token
                new_token = asyncio.run(
                    token_manager.refresh_token(
                        tenant_id=token.tenant_id,
                        shop_id=token.shop_id,
                        provider=token.provider
                    )
                )
                
                if new_token:
                    refreshed += 1
                    logger.info(f"Successfully refreshed token for shop {token.shop_id}")
                else:
                    failed += 1
                    logger.error(f"Failed to refresh token for shop {token.shop_id}")
                    
            except Exception as e:
                failed += 1
                logger.error(f"Error refreshing token for shop {token.shop_id}: {e}")
                try:
                    shop = self.db.query(Shop).filter(Shop.id == token.shop_id).first()
                    shop_name = (shop.display_name if shop else None) or f"Shop {token.shop_id}"
                    notify_tenant_admins(
                        db=self.db,
                        tenant_id=token.tenant_id,
                        notification_type=NotificationType.WARNING,
                        title="Token refresh failed",
                        message=f"Failed to refresh OAuth token for {shop_name}. The shop may lose connectivity if not resolved.",
                        action_url="/settings?tab=shops",
                        action_label="Check shop",
                    )
                except Exception:
                    pass
                continue

        result = {
            "status": "success",
            "refreshed": refreshed,
            "failed": failed,
            "total": len(expiring_tokens)
        }

        logger.info(f"Token refresh complete: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Token refresh task failed: {e}")
        raise self.retry(exc=e, countdown=300)  # Retry after 5 minutes


@celery_app.task(base=DatabaseTask, bind=True, max_retries=3)
def refresh_single_token(self, tenant_id: int, shop_id: int, provider: str = 'etsy'):
    """
    Refresh a single token (can be called manually)
    
    Args:
        tenant_id: Tenant ID
        shop_id: Shop ID
        provider: OAuth provider
    
    Returns:
        Dict with status and new expiry time
    """
    logger.info(f"Manual token refresh for shop {shop_id}")
    
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        token_manager = TokenManager(self.db, redis_client)
        
        new_token = asyncio.run(
            token_manager.refresh_token(tenant_id, shop_id, provider)
        )
        
        if new_token:
            # Get updated token record
            updated = self.db.query(OAuthToken).filter(
                OAuthToken.tenant_id == tenant_id,
                OAuthToken.shop_id == shop_id,
                OAuthToken.provider == provider
            ).first()
            
            return {
                "status": "success",
                "shop_id": shop_id,
                "expires_at": updated.expires_at.isoformat() if updated else None,
                "refresh_count": updated.refresh_count if updated else None
            }
        else:
            return {
                "status": "failed",
                "shop_id": shop_id,
                "error": "Token refresh returned None"
            }
            
    except Exception as e:
        logger.error(f"Single token refresh failed for shop {shop_id}: {e}")
        raise self.retry(exc=e, countdown=60)  # Retry after 1 minute


@celery_app.task(base=DatabaseTask, bind=True, max_retries=3)
def cleanup_expired_tokens(self):
    """
    Clean up tokens that have been expired for more than 30 days
    
    This is a maintenance task to keep the database clean
    """
    logger.info("Starting expired token cleanup task")
    
    try:
        from datetime import timedelta
        
        # Delete tokens expired for more than 30 days with no refresh capability
        threshold = datetime.now(timezone.utc) - timedelta(days=30)
        
        deleted = self.db.query(OAuthToken).filter(
            OAuthToken.expires_at < threshold,
            OAuthToken.refresh_token == None
        ).delete(synchronize_session=False)
        
        self.db.commit()
        
        logger.info(f"Deleted {deleted} expired tokens")
        
        return {
            "status": "success",
            "deleted": deleted
        }
        
    except Exception as e:
        logger.error(f"Token cleanup failed: {e}")
        self.db.rollback()
        return {
            "status": "failed",
            "error": str(e)
        }


@celery_app.task(base=DatabaseTask, bind=True, max_retries=3)
def audit_token_health(self):
    """
    Audit token health and log statistics
    
    Provides visibility into token refresh patterns
    """
    logger.info("Starting token health audit")
    
    try:
        from sqlalchemy import func
        from datetime import timedelta
        
        now = datetime.now(timezone.utc)
        
        # Total tokens
        total = self.db.query(func.count(OAuthToken.id)).scalar()
        
        # Expired tokens
        expired = self.db.query(func.count(OAuthToken.id)).filter(
            OAuthToken.expires_at < now
        ).scalar()
        
        # Expiring in 24 hours
        expiring_soon = self.db.query(func.count(OAuthToken.id)).filter(
            OAuthToken.expires_at < now + timedelta(hours=24),
            OAuthToken.expires_at >= now
        ).scalar()
        
        # Tokens refreshed in last 24 hours
        recently_refreshed = self.db.query(func.count(OAuthToken.id)).filter(
            OAuthToken.last_refreshed_at >= now - timedelta(hours=24)
        ).scalar()
        
        # Average refresh count
        avg_refresh_count = self.db.query(func.avg(OAuthToken.refresh_count)).scalar() or 0
        
        stats = {
            "total_tokens": total,
            "expired": expired,
            "expiring_in_24h": expiring_soon,
            "refreshed_in_24h": recently_refreshed,
            "avg_refresh_count": float(avg_refresh_count),
            "timestamp": now.isoformat()
        }
        
        logger.info(f"Token health audit: {stats}")
        
        return stats
        
    except Exception as e:
        logger.error(f"Token health audit failed: {e}")
        return {
            "status": "failed",
            "error": str(e)
        }
