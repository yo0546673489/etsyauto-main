"""
Discount Rules & Tasks Models
Stores discount configurations and automation task queue.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, JSON, ForeignKey, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class DiscountRule(Base):
    """
    כלל הנחה - מה ההנחה, על מה, ומתי
    """
    __tablename__ = "discount_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True)

    # פרטי ההנחה
    name = Column(String(200), nullable=False)
    discount_type = Column(String(50), nullable=False)   # percentage / fixed_amount
    discount_value = Column(Float, nullable=False)

    # על מה ההנחה חלה
    scope = Column(String(50), nullable=False, default="entire_shop")
    listing_ids = Column(JSON, nullable=True)
    category_id = Column(String(100), nullable=True)

    # תזמון
    is_scheduled = Column(Boolean, default=False)
    schedule_type = Column(String(50), nullable=True)    # one_time / rotating
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    rotation_config = Column(JSON, nullable=True)

    # שדות Etsy
    target_country = Column(String(100), nullable=True, default="everywhere")
    terms_text = Column(String(500), nullable=True)
    etsy_sale_name = Column(String(200), nullable=True)

    # סבב אוטומטי (auto-rotate)
    auto_rotate = Column(Boolean, default=False, nullable=False)
    auto_min_percent = Column(Float, nullable=True)
    auto_max_percent = Column(Float, nullable=True)
    auto_interval_days = Column(Integer, nullable=True)
    last_rotated_at = Column(DateTime(timezone=True), nullable=True)

    # סטטוס
    status = Column(String(50), default="draft", nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    shop = relationship("Shop", back_populates="discount_rules")
    tasks = relationship("DiscountTask", back_populates="rule", cascade="all, delete-orphan")


class DiscountTask(Base):
    """
    משימת הנחה בודדת שה-automation server מבצע
    """
    __tablename__ = "discount_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, ForeignKey("discount_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    shop_id = Column(BigInteger, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True)

    # מה לבצע
    action = Column(String(50), nullable=False)          # apply_discount / remove_discount
    discount_value = Column(Float, nullable=True)
    scope = Column(String(50), nullable=False)
    listing_ids = Column(JSON, nullable=True)

    # תזמון
    scheduled_for = Column(DateTime(timezone=True), nullable=False, index=True)

    # סטטוס ביצוע
    status = Column(String(50), default="pending", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(String(500), nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    rule = relationship("DiscountRule", back_populates="tasks")
    shop = relationship("Shop")
