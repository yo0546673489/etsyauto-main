"""
Email Service
Handles sending verification and password reset emails
"""
import smtplib
import secrets
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings


def generate_token(length: int = 32) -> str:
    """Generate a secure random token"""
    return secrets.token_urlsafe(length)


def send_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
    """
    Send an email via Resend (preferred) or SMTP (fallback)

    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML email body
        text_content: Plain text email body (optional)

    Returns:
        True if successful, False otherwise
    """
    # Use the new unified email service
    from app.services.resend_email import send_email as send_email_unified
    return send_email_unified(to_email, subject, html_content, text_content)


def send_verification_email(email: str, name: str, verification_token: str) -> bool:
    """
    Send email verification link

    Args:
        email: User's email address
        name: User's name
        verification_token: Verification token

    Returns:
        True if successful
    """
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={verification_token}"

    subject = "Verify Your Email Address"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Welcome to ETSY Automation Platform!</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi {name},</p>

            <p style="font-size: 16px;">Thank you for signing up! Please verify your email address to activate your account.</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{verification_url}"
                   style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Verify Email Address
                </a>
            </div>

            <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 14px; color: #667eea; word-break: break-all;">{verification_url}</p>

            <p style="font-size: 14px; color: #666; margin-top: 30px;">This link will expire in {settings.VERIFICATION_TOKEN_EXPIRY_HOURS} hours.</p>

            <p style="font-size: 14px; color: #666;">If you didn't create an account, you can safely ignore this email.</p>

            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

            <p style="font-size: 12px; color: #999; text-align: center;">
                © 2025 ETSY Automation Platform. All rights reserved.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
    Hi {name},

    Thank you for signing up! Please verify your email address to activate your account.

    Click the link below to verify your email:
    {verification_url}

    This link will expire in {settings.VERIFICATION_TOKEN_EXPIRY_HOURS} hours.

    If you didn't create an account, you can safely ignore this email.

    © 2025 Etsy Automation Platform
    """

    return send_email(email, subject, html_content, text_content)


def send_password_reset_email(email: str, name: str, reset_token: str) -> bool:
    """
    Send password reset link

    Args:
        email: User's email address
        name: User's name
        reset_token: Password reset token

    Returns:
        True if successful
    """
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    subject = "Reset Your Password"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Password Reset Request</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi {name},</p>

            <p style="font-size: 16px;">We received a request to reset your password. Click the button below to create a new password:</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_url}"
                   style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Reset Password
                </a>
            </div>

            <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
            <p style="font-size: 14px; color: #667eea; word-break: break-all;">{reset_url}</p>

            <p style="font-size: 14px; color: #666; margin-top: 30px;">This link will expire in {settings.RESET_TOKEN_EXPIRY_HOURS} hour(s).</p>

            <p style="font-size: 14px; color: #ff4444; font-weight: bold;">If you didn't request a password reset, please ignore this email and ensure your account is secure.</p>

            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

            <p style="font-size: 12px; color: #999; text-align: center;">
                © 2025 ETSY Automation Platform. All rights reserved.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
    Hi {name},

    We received a request to reset your password. Click the link below to create a new password:
    {reset_url}

    This link will expire in {settings.RESET_TOKEN_EXPIRY_HOURS} hour(s).

    If you didn't request a password reset, please ignore this email and ensure your account is secure.

    © 2025 Etsy Automation Platform
    """

    return send_email(email, subject, html_content, text_content)


def send_password_changed_notification(email: str, name: str) -> bool:
    """
    Send notification that password was successfully changed

    Args:
        email: User's email address
        name: User's name

    Returns:
        True if successful
    """
    subject = "Password Changed Successfully"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0;">Password Changed</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px;">Hi {name},</p>

            <p style="font-size: 16px;">Your password was successfully changed.</p>

            <p style="font-size: 14px; color: #666;">If you didn't make this change, please contact support immediately.</p>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{settings.FRONTEND_URL}/login"
                   style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Sign In
                </a>
            </div>

            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

            <p style="font-size: 12px; color: #999; text-align: center;">
                © 2025 ETSY Automation Platform. All rights reserved.
            </p>
        </div>
    </body>
    </html>
    """

    text_content = f"""
    Hi {name},

    Your password was successfully changed.

    If you didn't make this change, please contact support immediately.

    © 2025 Etsy Automation Platform
    """

    return send_email(email, subject, html_content, text_content)
