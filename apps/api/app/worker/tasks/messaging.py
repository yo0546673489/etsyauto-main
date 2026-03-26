"""
Celery tasks for scraping and replying to Etsy conversation threads
using AdsPower browser profiles driven by Playwright.
"""

import random
import time
import logging
from datetime import datetime, timezone
from typing import List
from uuid import uuid4

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from prometheus_client import Counter, Histogram

from app.worker.celery_app import celery_app as app  # type: ignore
from app.core.database import SessionLocal  # type: ignore
from app.services import adspower  # type: ignore
from app.models.audit import AuditLog  # type: ignore
from app.models.messaging import MessageThread  # type: ignore
from app.models.tenancy import Shop  # type: ignore
from app.services.notification_service import notify_tenant_admins  # type: ignore
from app.models.notifications import NotificationType  # type: ignore

logger = logging.getLogger(__name__)

messaging_scrape_total = Counter(
    "messaging_scrape_total",
    "Total conversation scrape attempts",
    labelnames=("shop_id", "status"),
)

messaging_reply_total = Counter(
    "messaging_reply_total",
    "Total reply send attempts",
    labelnames=("shop_id", "status"),
)

messaging_adspower_errors_total = Counter(
    "messaging_adspower_errors_total",
    "Total AdsPower API errors",
    labelnames=("shop_id", "error_type"),
)

messaging_scrape_duration_seconds = Histogram(
    "messaging_scrape_duration_seconds",
    "Time taken to scrape a conversation in seconds",
    labelnames=("shop_id",),
    buckets=(1, 2, 5, 10, 20, 30, 60),
)


HUMAN_DELAY_SCRAPE_MIN_MS = 1500
HUMAN_DELAY_SCRAPE_MAX_MS = 3500
HUMAN_DELAY_REPLY_MIN_MS = 1000
HUMAN_DELAY_REPLY_MAX_MS = 2500

MESSAGE_CONTAINER_SELECTOR = 'div.wt-text-body-01.wt-display-inline-block.wt-break-word'
REPLY_TEXTAREA_SELECTOR = 'textarea[placeholder="Type your reply"]'
SEND_BUTTON_SELECTOR = 'button.wt-btn.wt-btn--filled.wt-btn--small'
MESSAGE_LIST_SELECTOR = 'div.scrolling-message-list'
SENT_CONFIRMATION_SELECTOR = 'textarea[placeholder="Type your reply"]'


def _human_sleep_ms(min_ms: int, max_ms: int) -> None:
    delay = random.uniform(min_ms, max_ms) / 1000.0
    time.sleep(delay)


def _get_browser_and_page(cdp_url: str, target_url: str):
    """
    Connect to an existing AdsPower browser via CDP and navigate to target_url.
    Returns (browser, page) so caller can close browser in a finally block.
    """
    playwright_ctx = sync_playwright().start()
    try:
        browser = playwright_ctx.chromium.connect_over_cdp(cdp_url)
    except Exception:
        playwright_ctx.stop()
        raise

    try:
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(target_url, wait_until="networkidle")
        return playwright_ctx, browser, page
    except Exception:
        browser.close()
        playwright_ctx.stop()
        raise


def _append_audit(
    db,
    shop: Shop,
    thread: MessageThread,
    action: str,
    status: str,
    metadata: dict,
):
    audit = AuditLog(
        request_id=str(uuid4()),
        tenant_id=shop.tenant_id,
        shop_id=shop.id,
        action=action,
        target_type="message_thread",
        target_id=str(thread.id),
        status=status,
        request_metadata=metadata,
    )
    db.add(audit)


@app.task(bind=True, max_retries=3, retry_backoff=True)
def scrape_conversation(self, thread_id: int):
    """
    Scrape the full conversation text from an Etsy conversation URL and
    update the MessageThread row.
    """
    db = SessionLocal()
    profile_id = None
    thread = None
    shop = None
    start_time = time.time()
    selector_error_recorded = False

    try:
        thread = db.query(MessageThread).get(thread_id)  # type: ignore[attr-defined]
        if not thread:
            return

        shop = db.query(Shop).get(thread.shop_id)  # type: ignore[attr-defined]
        if not shop or not getattr(shop, "adspower_profile_id", None):
            return

        profile_id = shop.adspower_profile_id

        # If profile is already active, retry later to avoid conflicting sessions.
        if adspower.profile_is_active(profile_id):
            raise self.retry(exc=Exception("AdsPower profile is currently active"))

        try:
            cdp_url = adspower.open_profile(profile_id)
        except Exception:
            messaging_adspower_errors_total.labels(
                shop_id=str(thread.shop_id),
                error_type="open_profile_failed",
            ).inc()
            raise

        playwright_ctx, browser, page = _get_browser_and_page(
            cdp_url, thread.etsy_conversation_url  # type: ignore[attr-defined]
        )
        try:
            _human_sleep_ms(HUMAN_DELAY_SCRAPE_MIN_MS, HUMAN_DELAY_SCRAPE_MAX_MS)

            # Wait for at least one message container to appear
            try:
                page.wait_for_selector(MESSAGE_CONTAINER_SELECTOR, timeout=10_000)
            except PlaywrightTimeoutError as exc:
                selector_error_recorded = True
                messaging_scrape_total.labels(
                    shop_id=str(thread.shop_id),
                    status="selector_error",
                ).inc()
                logger.warning("DOM selector failed during scrape", extra={
                    "selector": MESSAGE_CONTAINER_SELECTOR,
                    "shop_id": thread.shop_id,
                    "thread_id": thread_id,
                    "error": "SELECTOR_NOT_FOUND"
                })
                raise RuntimeError(
                    f"Conversation message container not found using selector {MESSAGE_CONTAINER_SELECTOR!r}"
                ) from exc

            elements = page.query_selector_all(MESSAGE_CONTAINER_SELECTOR)
            messages: List[str] = []
            for el in elements:
                if el is None:
                    continue
                text = (el.inner_text() or "").strip()
                if text:
                    messages.append(text)

            combined = "\n\n".join(messages)

            thread.status = "unread"
            thread.customer_message = combined

            _append_audit(
                db,
                shop,
                thread,
                action="message_scraped",
                status="success",
                metadata={"thread_id": thread.id, "message_count": len(messages)},
            )

            db.commit()
            messaging_scrape_total.labels(
                shop_id=str(thread.shop_id),
                status="success"
            ).inc()
            messaging_scrape_duration_seconds.labels(
                shop_id=str(thread.shop_id)
            ).observe(time.time() - start_time)
        finally:
            try:
                browser.close()
            finally:
                playwright_ctx.stop()

    except Exception as exc:
        if db.is_active:
            db.rollback()

        if thread is not None and not selector_error_recorded:
            messaging_scrape_total.labels(
                shop_id=str(thread.shop_id),
                status="failed"
            ).inc()

        if thread is not None and shop is not None:
            thread.status = "failed"
            _append_audit(
                db,
                shop,
                thread,
                action="message_scraped",
                status="failed",
                metadata={"thread_id": thread.id, "error": str(exc)},
            )
            db.commit()
            try:
                notify_tenant_admins(
                    db=db,
                    tenant_id=shop.tenant_id,
                    notification_type=NotificationType.ERROR,
                    title="Message scrape failed",
                    message=f"Failed to scrape conversation for {shop.display_name or 'shop'}: {exc}",
                    action_url="/messages",
                    action_label="View messages",
                )
            except Exception:
                pass

        # Retry according to Celery policy
        raise self.retry(exc=exc)

    finally:
        if profile_id:
            try:
                adspower.close_profile(profile_id)
            except Exception:
                # close_profile should already swallow, but guard anyway
                pass

        db.close()


@app.task(bind=True, max_retries=3, retry_backoff=True)
def send_reply(self, thread_id: int, reply_text: str):
    """
    Send a reply in an Etsy conversation thread via Playwright / AdsPower.
    """
    db = SessionLocal()
    profile_id = None
    thread = None
    shop = None
    selector_error_recorded = False

    try:
        thread = db.query(MessageThread).get(thread_id)  # type: ignore[attr-defined]
        if not thread:
            return

        shop = db.query(Shop).get(thread.shop_id)  # type: ignore[attr-defined]
        if not shop or not getattr(shop, "adspower_profile_id", None):
            return

        profile_id = shop.adspower_profile_id

        if adspower.profile_is_active(profile_id):
            raise self.retry(exc=Exception("AdsPower profile is currently active"))

        try:
            cdp_url = adspower.open_profile(profile_id)
        except Exception:
            messaging_adspower_errors_total.labels(
                shop_id=str(thread.shop_id),
                error_type="open_profile_failed",
            ).inc()
            raise

        playwright_ctx, browser, page = _get_browser_and_page(
            cdp_url, thread.etsy_conversation_url  # type: ignore[attr-defined]
        )
        try:
            # Wait for reply box to be visible
            try:
                reply_box = page.wait_for_selector(REPLY_TEXTAREA_SELECTOR, timeout=10_000)
            except PlaywrightTimeoutError as exc:
                selector_error_recorded = True
                messaging_reply_total.labels(
                    shop_id=str(thread.shop_id),
                    status="selector_error"
                ).inc()
                logger.warning("DOM selector failed during reply", extra={
                    "selector": REPLY_TEXTAREA_SELECTOR,
                    "shop_id": thread.shop_id,
                    "thread_id": thread_id,
                    "error": "SELECTOR_NOT_FOUND"
                })
                raise RuntimeError(
                    f"Reply textarea not found using selector {REPLY_TEXTAREA_SELECTOR!r}"
                ) from exc
            reply_box.fill(reply_text)

            _human_sleep_ms(HUMAN_DELAY_REPLY_MIN_MS, HUMAN_DELAY_REPLY_MAX_MS)

            try:
                send_button = page.wait_for_selector(
                    SEND_BUTTON_SELECTOR,
                    timeout=10_000,
                )
            except PlaywrightTimeoutError as exc:
                selector_error_recorded = True
                messaging_reply_total.labels(
                    shop_id=str(thread.shop_id),
                    status="selector_error"
                ).inc()
                logger.warning("DOM selector failed during reply", extra={
                    "selector": REPLY_TEXTAREA_SELECTOR,
                    "shop_id": thread.shop_id,
                    "thread_id": thread_id,
                    "error": "SELECTOR_NOT_FOUND"
                })
                raise RuntimeError(
                    f"Send button not found using selector {SEND_BUTTON_SELECTOR!r}"
                ) from exc
            send_button.click()

            # Confirm send by waiting for the reply textarea value to clear/empty.
            try:
                page.wait_for_function(
                    """
                    (selector) => {
                        const el = document.querySelector(selector);
                        return !!el && (el.value || '').trim().length === 0;
                    }
                    """,
                    SENT_CONFIRMATION_SELECTOR,
                    timeout=10_000,
                )
            except PlaywrightTimeoutError as exc:
                selector_error_recorded = True
                messaging_reply_total.labels(
                    shop_id=str(thread.shop_id),
                    status="selector_error"
                ).inc()
                logger.warning("DOM selector failed during reply", extra={
                    "selector": REPLY_TEXTAREA_SELECTOR,
                    "shop_id": thread.shop_id,
                    "thread_id": thread_id,
                    "error": "SELECTOR_NOT_FOUND"
                })
                raise RuntimeError(
                    f"Reply textarea was not cleared after send using selector {SENT_CONFIRMATION_SELECTOR!r}"
                ) from exc

            thread.status = "replied"
            thread.replied_text = reply_text
            thread.replied_at = datetime.now(timezone.utc)

            _append_audit(
                db,
                shop,
                thread,
                action="message_replied",
                status="success",
                metadata={"thread_id": thread.id},
            )

            db.commit()
            messaging_reply_total.labels(
                shop_id=str(thread.shop_id),
                status="success"
            ).inc()
        finally:
            try:
                browser.close()
            finally:
                playwright_ctx.stop()

    except Exception as exc:
        if db.is_active:
            db.rollback()

        if thread is not None and not selector_error_recorded:
            messaging_reply_total.labels(
                shop_id=str(thread.shop_id),
                status="failed"
            ).inc()

        if thread is not None and shop is not None:
            try:
                notify_tenant_admins(
                    db=db,
                    tenant_id=shop.tenant_id,
                    notification_type=NotificationType.ERROR,
                    title="Message reply failed",
                    message=f"Failed to send reply for {shop.display_name or 'shop'}: {exc}",
                    action_url="/messages",
                    action_label="View messages",
                )
            except Exception:
                pass

        # For send_reply we follow the requested behavior: just retry on error.
        raise self.retry(exc=exc)

    finally:
        if profile_id:
            try:
                adspower.close_profile(profile_id)
            except Exception:
                pass
        db.close()


@app.task
def check_adspower_health():
    """
    Ping AdsPower API every 30 minutes.
    Logs error and increments counter if unreachable.
    """
    from app.services.adspower import AdsPowerService
    from app.core.config import settings
    import logging
    logger = logging.getLogger(__name__)

    try:
        service = AdsPowerService(
            settings.ADSPOWER_BASE_URL,
            settings.ADSPOWER_API_KEY
        )
        result = service.check_status()
        if not result:
            raise Exception("AdsPower status check returned falsy")
        logger.info("AdsPower health check passed")
    except Exception as e:
        logger.error("AdsPower health check FAILED", extra={
            "error": str(e),
            "base_url": settings.ADSPOWER_BASE_URL
        })
        messaging_adspower_errors_total.labels(
            shop_id="system",
            error_type="health_check_failed"
        ).inc()

