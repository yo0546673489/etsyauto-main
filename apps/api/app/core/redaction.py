import re
from typing import Any


# Sensitive keys that should be redacted
SENSITIVE_KEYS = {
    "password",
    "token",
    "secret",
    "api_key",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "csrf",
    "jwt",
    "key",
    "apikey",
    "auth",
    "client_secret",
    "private_key",
    "encryption_key",
    "bearer",
    "credentials",
    "passwd",
    "pwd",
    "pass",
}

# PII fields that should be scrubbed (Sentry only)
PII_KEYS = {
    "email",
    "phone",
    "ssn",
    "credit_card",
    "card_number",
    "cvv",
    "address",
    "first_name",
    "last_name",
    "full_name",
    "name",
    "ip_address",
    "user_agent",
    "location",
    "zip",
    "postal_code",
}


def scrub_sensitive_data(data: Any) -> Any:
    """
    Recursively scrub sensitive data from dictionaries and lists.
    """
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if any(sensitive in key.lower() for sensitive in SENSITIVE_KEYS):
                result[key] = "[REDACTED]"
            else:
                result[key] = scrub_sensitive_data(value)
        return result
    if isinstance(data, list):
        return [scrub_sensitive_data(item) for item in data]
    if isinstance(data, tuple):
        return tuple(scrub_sensitive_data(item) for item in data)
    return data


def scrub_pii(data: Any) -> Any:
    """
    Scrub PII (Personally Identifiable Information) from data.
    """
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            lower_key = key.lower()
            if any(pii in lower_key for pii in PII_KEYS):
                result[key] = "[PII]"
            else:
                result[key] = scrub_pii(value)
        return result
    if isinstance(data, list):
        return [scrub_pii(item) for item in data]
    if isinstance(data, tuple):
        return tuple(scrub_pii(item) for item in data)
    return data


def scrub_all(data: Any) -> Any:
    """
    Scrub both sensitive data and PII.
    """
    return scrub_pii(scrub_sensitive_data(data))


_SENSITIVE_KEY_PATTERN = re.compile(
    r'(?i)\b(' + "|".join(re.escape(k) for k in SENSITIVE_KEYS) + r')\b\s*[:=]\s*([^\s,;]+)'
)
_BEARER_PATTERN = re.compile(r'(?i)\bBearer\s+[A-Za-z0-9._-]+')
_SK_TOKEN_PATTERN = re.compile(r'\bsk-[A-Za-z0-9]{10,}\b')


def scrub_string(value: str) -> str:
    """
    Redact common secret patterns inside plain strings.
    """
    redacted = _SENSITIVE_KEY_PATTERN.sub(lambda m: f"{m.group(1)}=[REDACTED]", value)
    redacted = _BEARER_PATTERN.sub("Bearer [REDACTED]", redacted)
    redacted = _SK_TOKEN_PATTERN.sub("[REDACTED]", redacted)
    return redacted
