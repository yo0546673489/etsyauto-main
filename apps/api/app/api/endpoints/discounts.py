"""
Discounts API Endpoints
"""
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.dependencies import get_user_context as get_current_user_context, UserContext
from app.services.discounts_service import DiscountsService

router = APIRouter(prefix="/discounts", tags=["discounts"])
service = DiscountsService()
logger = logging.getLogger(__name__)


class RotationItem(BaseModel):
    day_of_week: int
    discount_value: float


class RuleCreate(BaseModel):
    name: str
    discount_type: str
    discount_value: float
    scope: str = "entire_shop"
    listing_ids: Optional[List[int]] = None
    category_id: Optional[str] = None
    is_scheduled: bool = False
    schedule_type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    rotation_config: Optional[List[RotationItem]] = None
    target_country: Optional[str] = "everywhere"
    terms_text: Optional[str] = None
    etsy_sale_name: Optional[str] = None
    status: str = "draft"
    is_active: bool = False
    start_offset_minutes: int = 0  # לפיזור פעולות בבאלק — כמה דקות לדחות את ה-task
    # סבב אוטומטי
    auto_rotate: bool = False
    auto_min_percent: Optional[float] = None
    auto_max_percent: Optional[float] = None
    auto_interval_days: Optional[int] = None


class RuleUpdate(RuleCreate):
    pass


def _parse_rule_data(data: RuleCreate) -> dict:
    d = data.dict()
    for field in ("start_date", "end_date"):
        val = d.get(field)
        if val:
            try:
                d[field] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception as _e:
                logger.warning(f"[discounts] failed to parse date field '{field}': {_e!r}")
                d[field] = None
        else:
            d[field] = None
    if d.get("rotation_config"):
        d["rotation_config"] = [item.dict() if hasattr(item, "dict") else item for item in d["rotation_config"]]
    return d


@router.get("/rules")
def get_rules(
    shop_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")
    rules = service.get_rules(db, shop_id, status)
    return [service.rule_to_dict(r) for r in rules]


@router.post("/rules")
def create_rule(
    data: RuleCreate,
    shop_id: int = Query(...),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    rule_data = _parse_rule_data(data)
    rule = service.create_rule(db, shop_id, rule_data)
    return service.rule_to_dict(rule)


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: int,
    data: RuleUpdate,
    shop_id: int = Query(...),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    try:
        rule_data = _parse_rule_data(data)
        rule = service.update_rule(db, rule_id, shop_id, rule_data)
        return service.rule_to_dict(rule)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    shop_id: int = Query(...),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    service.delete_rule(db, rule_id, shop_id)
    return {"success": True}


@router.post("/rules/{rule_id}/toggle")
def toggle_rule(
    rule_id: int,
    shop_id: int = Query(...),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    try:
        rule = service.toggle_rule(db, rule_id, shop_id)
        return service.rule_to_dict(rule)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/tasks")
def get_tasks(
    shop_id: Optional[int] = Query(None),
    rule_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    context: UserContext = Depends(get_current_user_context),
    db: Session = Depends(get_db),
):
    if not shop_id:
        raise HTTPException(status_code=400, detail="shop_id is required")
    tasks = service.get_tasks(db, shop_id, rule_id, status, limit)
    return [service.task_to_dict(t) for t in tasks]
