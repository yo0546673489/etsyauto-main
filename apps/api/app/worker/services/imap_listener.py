"""
Async IMAP IDLE listener for Etsy notification emails.

This service connects to an IMAP inbox, listens for new messages using the
IDLE command, and forwards qualifying Etsy conversation notifications to
the internal FastAPI API to create message threads.
"""

import asyncio
import email
import logging
import os
from email.message import EmailMessage
from typing import Optional, List

import aioimaplib
import httpx
from bs4 import BeautifulSoup

# Force our logger to output regardless of root logger state
_handler = logging.StreamHandler()
_handler.setLevel(logging.DEBUG)
_formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
_handler.setFormatter(_formatter)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(_handler)
logger.propagate = False


INTERNAL_API_URL = os.getenv("API_INTERNAL_URL", "http://api:8080")
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")


class IMAPIdleListener:
    def __init__(self, shop_id: int, imap_host: str, email_addr: str, password: str, port: int = 993) -> None:
        self.shop_id = shop_id
        self.imap_host = imap_host
        self.email_addr = email_addr
        self.password = password
        self.port = port
        self._client: Optional[aioimaplib.IMAP4_SSL] = None

    async def listen(self) -> None:
        """
        Main loop: connect, enter IDLE mode, and react to server pushes.

        Any connection error will be logged; the listener sleeps for 30s and
        then reconnects. This runs forever until cancelled.
        """
        while True:
            try:
                logger.info(
                    "IMAPIdleListener: connecting for shop_id=%s host=%s",
                    self.shop_id,
                    self.imap_host,
                )
                client = aioimaplib.IMAP4_SSL(host=self.imap_host, port=self.port, timeout=60)
                self._client = client

                await client.wait_hello_from_server()
                login_response = await client.login(self.email_addr, self.password)
                if login_response.result != "OK":
                    raise ConnectionError(
                        f"IMAP login failed for {self.email_addr}: {login_response.result} {login_response.lines}"
                    )
                await client.select("INBOX")

                logger.info("IMAPIdleListener: connected and INBOX selected for shop_id=%s", self.shop_id)

                # IDLE loop with periodic timeout (300s) to refresh connection
                while True:
                    idle_future = await client.idle_start(timeout=300)
                    logger.debug("IMAPIdleListener: entered IDLE for shop_id=%s", self.shop_id)

                    try:
                        # Wait for at least one server push or until timeout
                        push = await client.wait_server_push()
                        logger.debug(
                            "IMAPIdleListener: server push for shop_id=%s: %s",
                            self.shop_id,
                            push,
                        )
                        await self.process_new_emails()
                    except asyncio.TimeoutError:
                        logger.debug(
                            "IMAPIdleListener: IDLE timeout for shop_id=%s, refreshing connection",
                            self.shop_id,
                        )
                    finally:
                        client.idle_done()
                        # Ensure IDLE command is completed
                        try:
                            await asyncio.wait_for(idle_future, timeout=5)
                        except asyncio.TimeoutError:
                            logger.warning(
                                "IMAPIdleListener: IDLE completion timeout for shop_id=%s",
                                self.shop_id,
                            )

            except asyncio.CancelledError:
                logger.info("IMAPIdleListener: cancelled for shop_id=%s", self.shop_id)
                break
            except Exception as exc:
                logger.exception(
                    "IMAPIdleListener: connection error for shop_id=%s: %s",
                    self.shop_id,
                    exc,
                )
            finally:
                try:
                    if self._client is not None:
                        await self._client.logout()
                except Exception:
                    logger.debug("IMAPIdleListener: error during logout for shop_id=%s", self.shop_id)
                self._client = None

            logger.info(
                "IMAPIdleListener: reconnecting after 30s backoff for shop_id=%s",
                self.shop_id,
            )
            await asyncio.sleep(30)

    async def process_new_emails(self) -> None:
        """
        Fetch all UNSEEN emails, filter Etsy notifications, and create threads.
        """
        if self._client is None:
            logger.warning(
                "IMAPIdleListener: process_new_emails called with no active client for shop_id=%s",
                self.shop_id,
            )
            return

        client = self._client

        try:
            # Search for unseen messages
            search_response = await client.search("UNSEEN")
            if search_response.result != "OK":
                logger.warning(
                    "IMAPIdleListener: SEARCH UNSEEN failed for shop_id=%s: %s %s",
                    self.shop_id,
                    search_response.result,
                    search_response.lines,
                )
                return
        except Exception as exc:
            logger.exception(
                "IMAPIdleListener: SEARCH UNSEEN error for shop_id=%s: %s",
                self.shop_id,
                exc,
            )
            return

        # Extract UIDs from response
        uid_data = search_response.lines[0] if search_response.lines else b""
        if isinstance(uid_data, (bytes, bytearray)):
            uid_list = uid_data.decode().split()
        else:
            uid_list = str(uid_data).split()

        if not uid_list or uid_list == [""]:
            # No unseen messages
            return

        logger.info(
            "IMAPIdleListener: found %d UNSEEN messages for shop_id=%s",
            len(uid_list),
            self.shop_id,
        )

        for uid in uid_list:
            try:
                await self._process_single_email(uid)
            except Exception:
                logger.exception(
                    "IMAPIdleListener: error processing message uid=%s shop_id=%s",
                    uid,
                    self.shop_id,
                )

    async def _process_single_email(self, uid: str) -> None:
        if self._client is None:
            return

        client = self._client

        # Fetch full RFC822 message
        fetch_response = await client.fetch(uid, "(RFC822)")
        if fetch_response.result != "OK":
            logger.warning(
                "IMAPIdleListener: FETCH failed for uid=%s shop_id=%s: %s %s",
                uid,
                self.shop_id,
                fetch_response.result,
                fetch_response.lines,
            )
            return
        fetch_data = fetch_response.lines
        if not fetch_data:
            logger.warning(
                "IMAPIdleListener: FETCH returned empty payload for uid=%s shop_id=%s",
                uid,
                self.shop_id,
            )
            return

        raw_bytes = b""
        for part in fetch_data:
            if isinstance(part, tuple) and isinstance(part[1], (bytes, bytearray)):
                raw_bytes = part[1]
                break

        if not raw_bytes:
            logger.warning(
                "IMAPIdleListener: could not extract RFC822 payload for uid=%s shop_id=%s",
                uid,
                self.shop_id,
            )
            return

        msg: EmailMessage = email.message_from_bytes(raw_bytes)

        from_header = msg.get("From", "")
        if "etsy.com" not in from_header.lower():
            logger.debug(
                "IMAPIdleListener: skipping non-Etsy email uid=%s shop_id=%s From=%s",
                uid,
                self.shop_id,
                from_header,
            )
            await self._mark_seen(uid)
            return

        conversation_url = self.extract_conversation_url(msg)
        buyer_name = self.extract_buyer_name(msg)

        if conversation_url:
            logger.info(
                "IMAPIdleListener: creating thread for shop_id=%s uid=%s url=%s buyer=%s",
                self.shop_id,
                uid,
                conversation_url,
                buyer_name,
            )
            await self.create_thread(conversation_url, buyer_name)
        else:
            logger.info(
                "IMAPIdleListener: no conversation URL found for uid=%s shop_id=%s",
                uid,
                self.shop_id,
            )

        await self._mark_seen(uid)

    async def _mark_seen(self, uid: str) -> None:
        if self._client is None:
            return

        try:
            store_response = await self._client.store(uid, "+FLAGS", "(\\Seen)")
            status = store_response.result
            data = store_response.lines
            if status != "OK":
                logger.warning(
                    "IMAPIdleListener: failed to mark uid=%s as SEEN for shop_id=%s: %s %s",
                    uid,
                    self.shop_id,
                    status,
                    data,
                )
        except Exception as exc:
            logger.exception(
                "IMAPIdleListener: error marking uid=%s as SEEN for shop_id=%s: %s",
                uid,
                self.shop_id,
                exc,
            )

    @staticmethod
    def _get_html_parts(msg: EmailMessage) -> List[str]:
        bodies: List[str] = []
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                if ctype == "text/html":
                    try:
                        bodies.append(part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace"))
                    except Exception:
                        continue
        else:
            if msg.get_content_type() == "text/html":
                try:
                    bodies.append(
                        msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
                    )
                except Exception:
                    pass
        return bodies

    @classmethod
    def extract_conversation_url(cls, msg: EmailMessage) -> Optional[str]:
        """
        Parse HTML body and return the first href containing 'conversations'.
        """
        html_bodies = cls._get_html_parts(msg)
        for body in html_bodies:
            try:
                soup = BeautifulSoup(body, "html.parser")
                for a in soup.find_all("a", href=True):
                    href = a["href"]
                    if "conversations" in href:
                        return href
            except Exception:
                logger.debug("IMAPIdleListener: error parsing HTML body for conversation URL", exc_info=True)
        return None

    @staticmethod
    def extract_buyer_name(msg: EmailMessage) -> Optional[str]:
        """
        Attempt to extract buyer name from the subject line.

        This is heuristic and can be refined based on actual Etsy subject formats.
        """
        subject = msg.get("Subject", "") or ""
        if not subject:
            return None

        # Simple heuristic: look for 'from {name}' pattern
        lowered = subject.lower()
        marker = "from "
        if marker in lowered:
            idx = lowered.rfind(marker)
            name = subject[idx + len(marker) :].strip()
            return name or None
        return None

    async def create_thread(self, conversation_url: str, buyer_name: Optional[str]) -> None:
        """
        Call internal FastAPI endpoint to create a message thread.
        """
        if not INTERNAL_API_URL:
            logger.error("IMAPIdleListener: API_INTERNAL_URL is not configured")
            return

        url = f"{INTERNAL_API_URL.rstrip('/')}/api/messages/internal/create-thread"
        headers = {}
        if INTERNAL_API_SECRET:
            headers["INTERNAL_API_SECRET"] = INTERNAL_API_SECRET

        payload = {
            "shop_id": self.shop_id,
            "conversation_url": conversation_url,
            "customer_name": buyer_name,
        }

        logger.info(
            "IMAPIdleListener: POST %s payload=%s",
            url,
            payload,
        )

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.error(
                    "IMAPIdleListener: create-thread failed for shop_id=%s status=%s body=%s",
                    self.shop_id,
                    resp.status_code,
                    resp.text[:500],
                )
            else:
                logger.info(
                    "IMAPIdleListener: create-thread succeeded for shop_id=%s status=%s",
                    self.shop_id,
                    resp.status_code,
                )
        except Exception as exc:
            logger.exception(
                "IMAPIdleListener: HTTP error creating thread for shop_id=%s: %s",
                self.shop_id,
                exc,
            )

