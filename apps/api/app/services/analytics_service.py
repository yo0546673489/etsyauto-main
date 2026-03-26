"""
Analytics Service
Provides cached, server-side aggregations for owner/admin dashboards
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case
import json

from app.models.products import Product
from app.models.orders import Order, ShipmentEvent
from app.core.redis import get_redis_client


class AnalyticsService:
    """
    Analytics service with 5-minute caching and real-time refresh capability
    All metrics computed from authoritative order/shipment data
    """
    
    CACHE_TTL = 300  # 5 minutes
    
    def __init__(self, db: Session):
        self.db = db
        self.redis = get_redis_client()
    
    def _cache_key(self, tenant_id: int, shop_id: Optional[int], metric: str, shop_ids: Optional[List[int]] = None) -> str:
        """Generate Redis cache key for a metric"""
        if shop_ids:
            ids_str = ",".join(str(s) for s in sorted(shop_ids))
            return f"analytics:tenant_{tenant_id}:shops_{ids_str}:{metric}"
        shop_suffix = f":shop_{shop_id}" if shop_id else ""
        return f"analytics:tenant_{tenant_id}{shop_suffix}:{metric}"

    @staticmethod
    def _apply_shop_filter(filters: list, model_col, shop_id: Optional[int], shop_ids: Optional[List[int]] = None):
        """Append a shop filter — single id, multi ids, or none (tenant-wide)."""
        if shop_ids:
            filters.append(model_col.in_(shop_ids))
        elif shop_id:
            filters.append(model_col == shop_id)
    
    def _get_cached(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Get cached analytics data"""
        if not self.redis:
            return None
        try:
            cached = self.redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass
        return None
    
    def _set_cached(self, cache_key: str, data: Dict[str, Any]) -> None:
        """Cache analytics data"""
        if not self.redis:
            return
        try:
            self.redis.setex(cache_key, self.CACHE_TTL, json.dumps(data))
        except Exception:
            pass
    
    def _invalidate_cache(self, tenant_id: int, shop_id: Optional[int] = None) -> None:
        """Invalidate all analytics caches for a tenant/shop"""
        if not self.redis:
            return
        try:
            pattern = self._cache_key(tenant_id, shop_id, "*")
            keys = self.redis.keys(pattern)
            if keys:
                self.redis.delete(*keys)
        except Exception:
            pass
    
    def get_overview_analytics(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        force_refresh: bool = False,
        shop_ids: Optional[List[int]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get overview analytics: sales, orders, revenue trends
        Cached for 5 minutes unless force_refresh=True
        When start_date and end_date are provided, all metrics are computed for that range.
        """
        date_suffix = ""
        if start_date and end_date:
            date_suffix = f":{start_date.isoformat()}:{end_date.isoformat()}"
        cache_key = self._cache_key(tenant_id, shop_id, f"overview{date_suffix}", shop_ids)

        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached:
                return cached

        # Compute fresh analytics
        now = datetime.now(timezone.utc)
        use_date_range = start_date is not None and end_date is not None

        if use_date_range:
            last_7_days = end_date - timedelta(days=7)
            last_30_days = end_date - timedelta(days=30)
            last_7_days = max(last_7_days, start_date)
            last_30_days = max(last_30_days, start_date)
            prev_7_days = last_7_days - timedelta(days=7)
            prev_30_days = last_30_days - timedelta(days=30)
            date_filter = [Order.etsy_created_at >= start_date, Order.etsy_created_at <= end_date]
        else:
            last_7_days = now - timedelta(days=7)
            last_30_days = now - timedelta(days=30)
            prev_7_days = last_7_days - timedelta(days=7)
            prev_30_days = last_30_days - timedelta(days=30)
            date_filter = []

        # Base query
        base_query = self.db.query(Order).filter(Order.tenant_id == tenant_id)
        if shop_ids:
            base_query = base_query.filter(Order.shop_id.in_(shop_ids))
        elif shop_id:
            base_query = base_query.filter(Order.shop_id == shop_id)
        for f in date_filter:
            base_query = base_query.filter(f)

        # Total orders
        total_orders = base_query.count()

        # Last 7/30 days orders (within range or rolling)
        orders_7d = base_query.filter(Order.etsy_created_at >= last_7_days).count()
        orders_30d = base_query.filter(Order.etsy_created_at >= last_30_days).count()

        # Previous period for trends
        prev_orders_7d = base_query.filter(
            Order.etsy_created_at >= prev_7_days,
            Order.etsy_created_at < last_7_days
        ).count()
        prev_orders_30d = base_query.filter(
            Order.etsy_created_at >= prev_30_days,
            Order.etsy_created_at < last_30_days
        ).count()

        # Revenue (in cents, convert to dollars)
        # Exclude cancelled and refunded orders to match Etsy shop dashboard
        rev_filters = [
            Order.tenant_id == tenant_id,
            ~Order.status.in_(["cancelled", "refunded"]),
            or_(
                Order.lifecycle_status.is_(None),
                ~Order.lifecycle_status.in_(["cancelled", "refunded"]),
            ),
        ]
        self._apply_shop_filter(rev_filters, Order.shop_id, shop_id, shop_ids)
        rev_filters.extend(date_filter)

        total_revenue_cents = self.db.query(func.sum(Order.total_price)).filter(
            *rev_filters
        ).scalar() or 0
        total_revenue = float(total_revenue_cents) / 100

        revenue_7d_cents = self.db.query(func.sum(Order.total_price)).filter(
            *rev_filters,
            Order.etsy_created_at >= last_7_days
        ).scalar() or 0
        revenue_7d = float(revenue_7d_cents) / 100

        revenue_30d_cents = self.db.query(func.sum(Order.total_price)).filter(
            *rev_filters,
            Order.etsy_created_at >= last_30_days
        ).scalar() or 0
        revenue_30d = float(revenue_30d_cents) / 100

        prev_revenue_7d_cents = self.db.query(func.sum(Order.total_price)).filter(
            *rev_filters,
            Order.etsy_created_at >= prev_7_days,
            Order.etsy_created_at < last_7_days
        ).scalar() or 0
        prev_revenue_7d = float(prev_revenue_7d_cents) / 100

        prev_revenue_30d_cents = self.db.query(func.sum(Order.total_price)).filter(
            *rev_filters,
            Order.etsy_created_at >= prev_30_days,
            Order.etsy_created_at < last_30_days
        ).scalar() or 0
        prev_revenue_30d = float(prev_revenue_30d_cents) / 100

        # Count of orders that contribute to revenue (for avg_order_value)
        orders_for_revenue = self.db.query(Order).filter(*rev_filters).count()

        # Calculate trends
        orders_7d_trend = self._calculate_trend(orders_7d, prev_orders_7d)
        orders_30d_trend = self._calculate_trend(orders_30d, prev_orders_30d)
        revenue_7d_trend = self._calculate_trend(revenue_7d, prev_revenue_7d)
        revenue_30d_trend = self._calculate_trend(revenue_30d, prev_revenue_30d)

        # Average order value (based on revenue-contributing orders only)
        avg_order_value = total_revenue / orders_for_revenue if orders_for_revenue > 0 else 0

        result = {
            "total_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "avg_order_value": round(avg_order_value, 2),
            "orders_7d": orders_7d,
            "orders_30d": orders_30d,
            "revenue_7d": round(revenue_7d, 2),
            "revenue_30d": round(revenue_30d, 2),
            "orders_7d_trend": round(orders_7d_trend, 2),
            "orders_30d_trend": round(orders_30d_trend, 2),
            "revenue_7d_trend": round(revenue_7d_trend, 2),
            "revenue_30d_trend": round(revenue_30d_trend, 2),
            "computed_at": now.isoformat(),
        }
        if use_date_range:
            result["start_date"] = start_date.isoformat()
            result["end_date"] = end_date.isoformat()

        self._set_cached(cache_key, result)
        return result
    
    def get_order_analytics(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        force_refresh: bool = False,
        shop_ids: Optional[List[int]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get order analytics: status breakdown, volume trends
        When start_date and end_date are provided, filters orders by created_at.
        """
        if start_date and end_date:
            date_filter = [Order.etsy_created_at >= start_date, Order.etsy_created_at <= end_date]
            date_suffix = f":{start_date.date()}:{end_date.date()}"
        else:
            date_filter = []
            date_suffix = ""

        cache_key = self._cache_key(tenant_id, shop_id, f"orders{date_suffix}", shop_ids)
        
        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached:
                return cached
        
        # Base query
        base_query = self.db.query(Order).filter(Order.tenant_id == tenant_id)
        if shop_ids:
            base_query = base_query.filter(Order.shop_id.in_(shop_ids))
        elif shop_id:
            base_query = base_query.filter(Order.shop_id == shop_id)
        for f in date_filter:
            base_query = base_query.filter(f)
        
        # Order status breakdown
        status_counts = {}
        for status in ["processing", "in_transit", "completed", "cancelled", "refunded"]:
            if status == "processing":
                count = base_query.filter(
                    or_(
                        Order.lifecycle_status == "processing",
                        and_(
                            Order.lifecycle_status.is_(None),
                            or_(
                                Order.etsy_status.is_(None),
                                ~Order.etsy_status.in_(["completed", "canceled", "cancelled", "refunded", "fully refunded"])
                            ),
                            or_(Order.fulfillment_status.is_(None), Order.fulfillment_status == "unshipped")
                        )
                    )
                ).count()
            elif status == "in_transit":
                count = base_query.filter(
                    or_(
                        Order.lifecycle_status == "in_transit",
                        and_(Order.lifecycle_status.is_(None), Order.fulfillment_status == "shipped")
                    )
                ).count()
            elif status == "completed":
                count = base_query.filter(
                    or_(
                        Order.lifecycle_status == "completed",
                        and_(
                            Order.lifecycle_status.is_(None),
                            or_(Order.fulfillment_status == "delivered", Order.etsy_status == "completed")
                        )
                    )
                ).count()
            elif status == "cancelled":
                count = base_query.filter(
                    or_(
                        Order.lifecycle_status == "cancelled",
                        and_(Order.lifecycle_status.is_(None), Order.etsy_status.in_(["canceled", "cancelled"]))
                    )
                ).count()
            elif status == "refunded":
                count = base_query.filter(
                    or_(
                        Order.lifecycle_status == "refunded",
                        and_(Order.lifecycle_status.is_(None), Order.etsy_status.in_(["refunded", "fully refunded"]))
                    )
                ).count()
            else:
                count = 0
            status_counts[status] = count
        
        # Payment status
        paid_count = base_query.filter(
            or_(
                Order.payment_status == "paid",
                and_(Order.payment_status.is_(None), Order.etsy_status.in_(["paid", "completed"]))
            )
        ).count()
        
        unpaid_count = base_query.filter(
            or_(
                Order.payment_status == "unpaid",
                and_(
                    Order.payment_status.is_(None),
                    or_(Order.etsy_status.is_(None), ~Order.etsy_status.in_(["paid", "completed"]))
                )
            )
        ).count()
        
        result = {
            "status_breakdown": status_counts,
            "payment_breakdown": {
                "paid": paid_count,
                "unpaid": unpaid_count,
            },
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }
        
        self._set_cached(cache_key, result)
        return result
    
    def get_product_analytics(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        force_refresh: bool = False,
        shop_ids: Optional[List[int]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get product analytics: listing performance, publish stats
        When start_date and end_date are provided, filters products and listing jobs by created_at.
        """
        if start_date and end_date:
            date_filter = [Product.created_at >= start_date, Product.created_at <= end_date]
            date_suffix = f":{start_date.date()}:{end_date.date()}"
        else:
            date_filter = []
            date_suffix = ""

        cache_key = self._cache_key(tenant_id, shop_id, f"products{date_suffix}", shop_ids)
        
        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached:
                return cached
        
        # Product counts (include shop_id=null for manual/CSV imports when filtering by shop)
        product_query = self.db.query(Product).filter(Product.tenant_id == tenant_id)
        if shop_ids:
            product_query = product_query.filter(or_(Product.shop_id.in_(shop_ids), Product.shop_id.is_(None)))
        elif shop_id:
            product_query = product_query.filter(or_(Product.shop_id == shop_id, Product.shop_id.is_(None)))
        for f in date_filter:
            product_query = product_query.filter(f)
        
        total_products = product_query.count()
        published_products = product_query.filter(Product.etsy_listing_id.isnot(None)).count()
        draft_products = product_query.filter(Product.etsy_listing_id.is_(None)).count()
        
        result = {
            "total_products": total_products,
            "published_products": published_products,
            "draft_products": draft_products,
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }
        
        self._set_cached(cache_key, result)
        return result
    
    def get_fulfillment_analytics(
        self,
        tenant_id: int,
        shop_id: Optional[int] = None,
        force_refresh: bool = False,
        shop_ids: Optional[List[int]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get fulfillment analytics: shipment timing, delivery rates, supplier performance
        When start_date and end_date are provided, filters shipment events by event_timestamp.
        """
        if start_date and end_date:
            date_filter = [ShipmentEvent.event_timestamp >= start_date, ShipmentEvent.event_timestamp <= end_date]
            date_suffix = f":{start_date.date()}:{end_date.date()}"
        else:
            date_filter = []
            date_suffix = ""

        cache_key = self._cache_key(tenant_id, shop_id, f"fulfillment{date_suffix}", shop_ids)
        
        if not force_refresh:
            cached = self._get_cached(cache_key)
            if cached:
                return cached
        
        # Shipment events
        event_query = self.db.query(ShipmentEvent).filter(ShipmentEvent.tenant_id == tenant_id)
        if shop_ids:
            event_query = event_query.filter(ShipmentEvent.shop_id.in_(shop_ids))
        elif shop_id:
            event_query = event_query.filter(ShipmentEvent.shop_id == shop_id)
        for f in date_filter:
            event_query = event_query.filter(f)
        
        # State counts
        state_counts = {}
        for state in ["processing", "shipped", "in_transit", "delivered", "delayed", "cancelled"]:
            count = event_query.filter(ShipmentEvent.state == state).count()
            state_counts[state] = count
        
        # Source breakdown
        manual_count = event_query.filter(ShipmentEvent.source == "manual").count()
        etsy_sync_count = event_query.filter(ShipmentEvent.source == "etsy_sync").count()
        auto_count = event_query.filter(ShipmentEvent.source == "auto").count()
        
        # Average fulfillment time (order created to shipped)
        avg_filters = [
            ShipmentEvent.tenant_id == tenant_id,
            ShipmentEvent.state == "shipped",
            ShipmentEvent.shipped_at.isnot(None),
        ]
        if shop_ids:
            avg_filters.append(ShipmentEvent.shop_id.in_(shop_ids))
        elif shop_id:
            avg_filters.append(ShipmentEvent.shop_id == shop_id)
        avg_filters.extend(date_filter)

        avg_fulfillment_query = self.db.query(
            func.avg(
                func.extract('epoch', ShipmentEvent.shipped_at - Order.etsy_created_at)
            )
        ).join(Order, ShipmentEvent.order_id == Order.id).filter(*avg_filters)
        
        avg_fulfillment_seconds = avg_fulfillment_query.scalar() or 0
        avg_fulfillment_hours = avg_fulfillment_seconds / 3600 if avg_fulfillment_seconds else 0
        
        # Supplier performance (owner-only metric)
        supplier_stats = {}
        supplier_filters = [
            Order.tenant_id == tenant_id,
            Order.supplier_user_id.isnot(None),
        ]
        if shop_ids:
            supplier_filters.append(Order.shop_id.in_(shop_ids))
        elif shop_id:
            supplier_filters.append(Order.shop_id == shop_id)
        # Filter by ShipmentEvent date when date range provided
        if date_filter:
            supplier_filters.append(ShipmentEvent.event_timestamp >= start_date)
            supplier_filters.append(ShipmentEvent.event_timestamp <= end_date)

        supplier_query = self.db.query(
            Order.supplier_user_id,
            func.count(ShipmentEvent.id).label('shipment_count'),
        ).join(ShipmentEvent, Order.id == ShipmentEvent.order_id).filter(
            *supplier_filters
        ).group_by(Order.supplier_user_id).all()
        
        for supplier_id, shipment_count in supplier_query:
            supplier_stats[str(supplier_id)] = {
                "shipment_count": shipment_count,
            }
        
        result = {
            "state_breakdown": state_counts,
            "source_breakdown": {
                "manual": manual_count,
                "etsy_sync": etsy_sync_count,
                "auto": auto_count,
            },
            "avg_fulfillment_time_hours": round(avg_fulfillment_hours, 2),
            "supplier_performance": supplier_stats,
            "computed_at": datetime.now(timezone.utc).isoformat(),
        }
        
        self._set_cached(cache_key, result)
        return result
    
    def _calculate_trend(self, current: float, previous: float) -> float:
        """Calculate percentage change between two values"""
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100
    
    def invalidate_all(self, tenant_id: int, shop_id: Optional[int] = None) -> None:
        """Force invalidation of all analytics caches"""
        self._invalidate_cache(tenant_id, shop_id)
