"""
Discounts Service
Manages discount rules and generates automation task queues.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.discounts import DiscountRule, DiscountTask


class DiscountsService:

    def get_rules(self, db: Session, shop_id: int, status: Optional[str] = None) -> List[DiscountRule]:
        query = db.query(DiscountRule).filter(
            DiscountRule.shop_id == shop_id,
            DiscountRule.status != 'deleted',  # סינון כללים שנמחקו
        )
        if status:
            query = query.filter(DiscountRule.status == status)
        return query.order_by(desc(DiscountRule.created_at)).all()

    def create_rule(self, db: Session, shop_id: int, data: dict) -> DiscountRule:
        start_offset_minutes = data.pop('start_offset_minutes', 0)
        rule = DiscountRule(shop_id=shop_id, **data)
        db.add(rule)
        db.flush()

        if rule.is_scheduled and rule.schedule_type:
            # יש תזמון מוגדר — ניצור tasks לפי הלוח
            self._generate_tasks(db, rule)
        elif rule.is_active:
            # פעיל — מתחיל מיד או עם דחייה (לפיזור באלק)
            self._create_immediate_task(db, rule, 'apply_discount', delay_minutes=start_offset_minutes)

        db.commit()
        db.refresh(rule)
        return rule

    def update_rule(self, db: Session, rule_id: int, shop_id: int, data: dict) -> DiscountRule:
        rule = db.query(DiscountRule).filter(
            DiscountRule.id == rule_id,
            DiscountRule.shop_id == shop_id,
        ).first()
        if not rule:
            raise ValueError("Rule not found")

        was_active = rule.is_active

        for key, value in data.items():
            setattr(rule, key, value)

        # מחק tasks ממתינים ישנים
        db.query(DiscountTask).filter(
            DiscountTask.rule_id == rule_id,
            DiscountTask.status == "pending",
        ).delete()

        if rule.is_scheduled and rule.schedule_type:
            self._generate_tasks(db, rule)
        elif rule.is_active:
            # פעיל בלי תאריך — מתחיל מיד
            self._create_immediate_task(db, rule, 'apply_discount')
        elif was_active and not rule.is_active:
            # כובה — מסיים מיד
            self._create_immediate_task(db, rule, 'remove_discount')

        db.commit()
        db.refresh(rule)
        return rule

    def delete_rule(self, db: Session, rule_id: int, shop_id: int):
        rule = db.query(DiscountRule).filter(
            DiscountRule.id == rule_id,
            DiscountRule.shop_id == shop_id,
        ).first()
        if not rule:
            return

        # אם ההנחה פעילה — צור task לסיום המבצע ב-Etsy לפני המחיקה
        if rule.is_active:
            self._create_immediate_task(db, rule, 'remove_discount')
            db.flush()

        # מחיקה רכה — לא מוחקים מה-DB כי ה-task עדיין צריך לגשת לכלל
        rule.status = 'deleted'
        rule.is_active = False
        db.commit()

    def toggle_rule(self, db: Session, rule_id: int, shop_id: int) -> DiscountRule:
        rule = db.query(DiscountRule).filter(
            DiscountRule.id == rule_id,
            DiscountRule.shop_id == shop_id,
        ).first()
        if not rule:
            raise ValueError("Rule not found")

        rule.is_active = not rule.is_active
        rule.status = "active" if rule.is_active else "paused"

        # מחק tasks ממתינים ישנים
        db.query(DiscountTask).filter(
            DiscountTask.rule_id == rule_id,
            DiscountTask.status == "pending",
        ).delete()

        if rule.is_active:
            # הופעל — מתחיל מיד
            self._create_immediate_task(db, rule, 'apply_discount')
        else:
            # כובה — מסיים מיד
            self._create_immediate_task(db, rule, 'remove_discount')

        db.commit()
        db.refresh(rule)
        return rule

    def get_tasks(self, db: Session, shop_id: int, rule_id: Optional[int] = None,
                  status: Optional[str] = None, limit: int = 50) -> List[DiscountTask]:
        query = db.query(DiscountTask).filter(DiscountTask.shop_id == shop_id)
        if rule_id:
            query = query.filter(DiscountTask.rule_id == rule_id)
        if status:
            query = query.filter(DiscountTask.status == status)
        return query.order_by(desc(DiscountTask.scheduled_for)).limit(limit).all()

    def _create_immediate_task(self, db: Session, rule: DiscountRule, action: str, delay_minutes: int = 0):
        """יוצר task שמתבצע מיד או עם דחייה (לפיזור פעולות בבאלק)."""
        scheduled_for = datetime.now(timezone.utc)
        if delay_minutes > 0:
            scheduled_for += timedelta(minutes=delay_minutes)
        task = DiscountTask(
            rule_id=rule.id,
            shop_id=rule.shop_id,
            action=action,
            discount_value=rule.discount_value if action == 'apply_discount' else None,
            scope=rule.scope,
            listing_ids=rule.listing_ids,
            scheduled_for=scheduled_for,
            status='pending',
        )
        db.add(task)

    def _generate_tasks(self, db: Session, rule: DiscountRule):
        """יוצר tasks לפי תזמון מוגדר (one_time / rotating)."""
        now = datetime.now(timezone.utc)
        tasks = []

        if rule.schedule_type == "one_time":
            if rule.start_date and rule.start_date > now:
                tasks.append(DiscountTask(
                    rule_id=rule.id,
                    shop_id=rule.shop_id,
                    action="apply_discount",
                    discount_value=rule.discount_value,
                    scope=rule.scope,
                    listing_ids=rule.listing_ids,
                    scheduled_for=rule.start_date,
                    status="pending",
                ))
            if rule.end_date and rule.end_date > now:
                tasks.append(DiscountTask(
                    rule_id=rule.id,
                    shop_id=rule.shop_id,
                    action="remove_discount",
                    discount_value=None,
                    scope=rule.scope,
                    listing_ids=rule.listing_ids,
                    scheduled_for=rule.end_date,
                    status="pending",
                ))

        elif rule.schedule_type == "rotating" and rule.rotation_config:
            start = rule.start_date or now
            end = rule.end_date or (start + timedelta(days=90))

            current = start
            while current <= end:
                dow = current.weekday()
                for item in rule.rotation_config:
                    if item.get("day_of_week") == dow and item.get("discount_value"):
                        tasks.append(DiscountTask(
                            rule_id=rule.id,
                            shop_id=rule.shop_id,
                            action="apply_discount",
                            discount_value=item["discount_value"],
                            scope=rule.scope,
                            listing_ids=rule.listing_ids,
                            scheduled_for=current,
                            status="pending",
                        ))
                current += timedelta(days=1)
                if len(tasks) > 500:
                    break

        for task in tasks:
            db.add(task)

    def rule_to_dict(self, rule: DiscountRule) -> dict:
        return {
            "id": rule.id,
            "shop_id": rule.shop_id,
            "name": rule.name,
            "discount_type": rule.discount_type,
            "discount_value": rule.discount_value,
            "scope": rule.scope,
            "listing_ids": rule.listing_ids,
            "category_id": rule.category_id,
            "is_scheduled": rule.is_scheduled,
            "schedule_type": rule.schedule_type,
            "start_date": rule.start_date.isoformat() if rule.start_date else None,
            "end_date": rule.end_date.isoformat() if rule.end_date else None,
            "rotation_config": rule.rotation_config,
            "target_country": rule.target_country,
            "terms_text": rule.terms_text,
            "etsy_sale_name": rule.etsy_sale_name,
            "auto_rotate": rule.auto_rotate,
            "auto_min_percent": rule.auto_min_percent,
            "auto_max_percent": rule.auto_max_percent,
            "auto_interval_days": rule.auto_interval_days,
            "last_rotated_at": rule.last_rotated_at.isoformat() if rule.last_rotated_at else None,
            "status": rule.status,
            "is_active": rule.is_active,
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
            "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
        }

    def task_to_dict(self, task: DiscountTask) -> dict:
        return {
            "id": task.id,
            "rule_id": task.rule_id,
            "shop_id": task.shop_id,
            "action": task.action,
            "discount_value": task.discount_value,
            "scope": task.scope,
            "listing_ids": task.listing_ids,
            "scheduled_for": task.scheduled_for.isoformat() if task.scheduled_for else None,
            "status": task.status,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            "error_message": task.error_message,
            "retry_count": task.retry_count,
        }
