"""
Email Service
Handles sending emails via SMTP
"""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails"""

    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM_EMAIL
        self.from_name = settings.SMTP_FROM_NAME
        self.frontend_url = settings.FRONTEND_URL

    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """
        Send an email

        Args:
            to_email: Recipient email address
            subject: Email subject
            html_content: HTML body content
            text_content: Optional plain text alternative

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            # Add plain text version if provided
            if text_content:
                part1 = MIMEText(text_content, 'plain')
                msg.attach(part1)

            # Add HTML version
            part2 = MIMEText(html_content, 'html')
            msg.attach(part2)

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    def send_team_invitation(
        self,
        to_email: str,
        to_name: str,
        inviter_name: str,
        organization_name: str,
        role: str,
        invitation_token: str
    ) -> bool:
        """
        Send team invitation email

        Args:
            to_email: Invitee email address
            to_name: Invitee name
            inviter_name: Name of person sending invitation
            organization_name: Organization name
            role: Role being assigned
            invitation_token: Unique invitation token

        Returns:
            bool: True if email sent successfully
        """
        accept_url = f"{self.frontend_url}/accept-invitation?token={invitation_token}"

        subject = f"{inviter_name} invited you to join {organization_name} on Etsy Auto"

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #e2e8f0; background-color: #0f172a; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">Team Invitation</h1>
        </div>

        <!-- Content -->
        <div style="padding: 32px 24px;">
            <p style="margin: 0 0 16px; color: #e2e8f0; font-size: 16px;">
                Hi {to_name},
            </p>

            <p style="margin: 0 0 16px; color: #e2e8f0; font-size: 16px;">
                <strong style="color: #14b8a6;">{inviter_name}</strong> has invited you to join
                <strong style="color: #14b8a6;">{organization_name}</strong> on Etsy Auto as a <strong>{role.title()}</strong>.
            </p>

            <p style="margin: 0 0 24px; color: #cbd5e1; font-size: 14px;">
                Etsy Auto is a powerful platform for automating your Etsy shop management with AI-assisted listing creation,
                policy compliance checking, and automated publishing.
            </p>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 32px 0;">
                <a href="{accept_url}"
                   style="display: inline-block; padding: 14px 32px; background-color: #14b8a6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Accept Invitation
                </a>
            </div>

            <p style="margin: 24px 0 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="{accept_url}" style="color: #14b8a6; word-break: break-all;">{accept_url}</a>
            </p>

            <p style="margin: 24px 0 0; color: #94a3b8; font-size: 13px;">
                This invitation will expire in 7 days.
            </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #0f172a; padding: 20px 24px; text-align: center; border-top: 1px solid #334155;">
            <p style="margin: 0; color: #64748b; font-size: 12px;">
                Etsy Automation Platform | Automate your Etsy shop with confidence
            </p>
        </div>
    </div>
</body>
</html>
"""

        text_content = f"""
Team Invitation

Hi {to_name},

{inviter_name} has invited you to join {organization_name} on Etsy Auto as a {role.title()}.

To accept this invitation, click the link below or copy it to your browser:
{accept_url}

This invitation will expire in 7 days.

---
Etsy Automation Platform
"""

        # Use unified email service (Resend when USE_RESEND=true, else SMTP)
        from app.services.resend_email import send_email as send_email_unified
        return send_email_unified(to_email, subject, html_content, text_content)


# Global instance
email_service = EmailService()
