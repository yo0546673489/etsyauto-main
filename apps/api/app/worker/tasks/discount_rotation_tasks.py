"""
Discount Rotation Tasks
בודק כל שעה אם יש כללים עם auto_rotate=True שצריך לסובב,
ומייצר DiscountTask חדש עם אחוז הנחה אקראי בין min ל-max.
"""
import random
import logging
from datetime import datetime, timezone

from app.worker.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.discounts import DiscountRule, DiscountTask

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.discount_rotation_tasks.rotate_auto_discounts")
def rotate_auto_discounts():
    """
    רץ כל שעה. מוצא את כל כללי ה-auto_rotate הפעילים
    ובודק אם הגיע הזמן לסובב את ההנחה.
    """
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        rules = db.query(DiscountRule).filter(
            DiscountRule.auto_rotate == True,
            DiscountRule.is_active == True,
            DiscountRule.status != 'deleted',
        ).all()

        rotated = 0
        for rule in rules:
            if not rule.auto_min_percent or not rule.auto_max_percent or not rule.auto_interval_days:
                continue

            # בדוק אם הגיע הזמן לסבב
            if rule.last_rotated_at is not None:
                last = rule.last_rotated_at
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                days_since = (now - last).total_seconds() / 86400
                if days_since < rule.auto_interval_days:
                    continue

            # בחר אחוז אקראי בין min ל-max (עיגול לשלם)
            new_percent = round(random.uniform(rule.auto_min_percent, rule.auto_max_percent))
            new_percent = max(int(rule.auto_min_percent), min(int(rule.auto_max_percent), new_percent))

            # צור task לעדכון ב-Etsy
            task = DiscountTask(
                rule_id=rule.id,
                shop_id=rule.shop_id,
                action='apply_discount',
                discount_value=float(new_percent),
                scope=rule.scope,
                listing_ids=rule.listing_ids,
                scheduled_for=now,
                status='pending',
            )
            db.add(task)

            # עדכן את הכלל
            rule.discount_value = float(new_percent)
            rule.last_rotated_at = now

            rotated += 1
            logger.info(f"[auto-rotate] rule={rule.id} shop={rule.shop_id} new_percent={new_percent}%")

        db.commit()
        logger.info(f"[auto-rotate] סיים — סובבו {rotated} כללים מתוך {len(rules)}")
        return {"rotated": rotated, "total": len(rules)}

    except Exception as e:
        db.rollback()
        logger.error(f"[auto-rotate] שגיאה: {e}", exc_info=True)
        raise
    finally:
        db.close()
