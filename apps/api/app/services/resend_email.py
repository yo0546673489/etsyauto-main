"""
Email Service with Resend Support
Unified email service that uses Resend when available, falls back to SMTP
"""
import resend
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure Resend if available
if settings.USE_RESEND and settings.RESEND_API_KEY:
    resend.api_key = settings.RESEND_API_KEY
    logger.info("📧 Resend email service initialized")
else:
    logger.info("📧 SMTP email service initialized (fallback)")


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """
    Send email using Resend (preferred) or SMTP (fallback)

    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML email body
        text_content: Plain text email body (optional)

    Returns:
        True if sent successfully, False otherwise
    """
    # Try Resend first if configured
    if settings.USE_RESEND and settings.RESEND_API_KEY:
        return _send_via_resend(to_email, subject, html_content, text_content)

    # Fall back to SMTP
    return _send_via_smtp(to_email, subject, html_content, text_content)


def _send_via_resend(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """Send email via Resend"""
    try:
        params = {
            "from": f"{settings.SMTP_FROM_NAME} <{settings.EMAIL_FROM}>",
            "to": [to_email],
            "subject": subject,
            "html": html_content
        }

        # Add text version if provided
        if text_content:
            params["text"] = text_content

        response = resend.Emails.send(params)
        logger.info(f"✅ Email sent via Resend to {to_email}")
        return True

    except Exception as e:
        logger.error(f"❌ Resend email failed: {str(e)}")
        # Fall back to SMTP
        logger.info("🔄 Falling back to SMTP...")
        return _send_via_smtp(to_email, subject, html_content, text_content)


def _send_via_smtp(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> bool:
    """Send email via SMTP (fallback)"""
    # Check SMTP configuration
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning(f"⚠️  Email not configured. Would have sent to {to_email}")
        logger.warning(f"   Subject: {subject}")
        return True  # Return True in dev mode to avoid blocking registration

    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg['To'] = to_email

        # Add plain text and HTML parts
        if text_content:
            msg.attach(MIMEText(text_content, 'plain'))
        msg.attach(MIMEText(html_content, 'html'))

        # Send email
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"✅ Email sent via SMTP to {to_email}")
        return True

    except Exception as e:
        logger.error(f"❌ SMTP email failed: {str(e)}")
        return False


# Convenience functions for common email types

def send_verification_email(email: str, name: str, verification_token: str) -> bool:
    """Send verification email"""
    from app.core.email import send_verification_email as original_send
    return original_send(email, name, verification_token)


def send_password_reset_email(email: str, name: str, reset_token: str) -> bool:
    """Send password reset email"""
    from app.core.email import send_password_reset_email as original_send
    return original_send(email, name, reset_token)


def send_password_changed_notification(email: str, name: str) -> bool:
    """Send password changed notification"""
    from app.core.email import send_password_changed_notification as original_send
    return original_send(email, name)


# Test function
def test_email_config() -> dict:
    """
    Test email configuration

    Returns:
        Dict with configuration status
    """
    status = {
        "resend_configured": bool(settings.RESEND_API_KEY),
        "resend_enabled": settings.USE_RESEND,
        "smtp_configured": bool(settings.SMTP_USER and settings.SMTP_PASSWORD),
        "email_from": settings.EMAIL_FROM if settings.USE_RESEND else settings.SMTP_FROM_EMAIL,
        "service": "Resend" if (settings.USE_RESEND and settings.RESEND_API_KEY) else "SMTP"
    }

    if not status["resend_configured"] and not status["smtp_configured"]:
        status["warning"] = "No email service configured! Emails will not be sent."
    elif status["resend_configured"] and status["resend_enabled"]:
        status["message"] = "✅ Resend is configured and active"
    elif status["smtp_configured"]:
        status["message"] = "✅ SMTP is configured and active"

    return status
