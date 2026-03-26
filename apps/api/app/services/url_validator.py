"""
URL Validation Service — SSRF Protection

Validates URLs before the server fetches them on behalf of a user.
Blocks:
- Non-HTTPS schemes (file://, ftp://, gopher://, data:, etc.)
- RFC 1918 private IPs (10.x, 172.16-31.x, 192.168.x)
- Link-local addresses (169.254.x.x, fe80::)
- Loopback addresses (127.x.x.x, ::1)
- Cloud metadata endpoints (169.254.169.254)
"""
import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Known-safe image CDN domains (optional allowlist — empty means any public domain is OK)
ALLOWED_DOMAINS: set[str] = set()

# Blocked IP ranges
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("10.0.0.0/8"),         # RFC 1918
    ipaddress.ip_network("172.16.0.0/12"),      # RFC 1918
    ipaddress.ip_network("192.168.0.0/16"),     # RFC 1918
    ipaddress.ip_network("169.254.0.0/16"),     # Link-local / cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),          # "This" network
    ipaddress.ip_network("::1/128"),            # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),           # IPv6 ULA
    ipaddress.ip_network("fe80::/10"),          # IPv6 link-local
]


def _is_blocked_ip(host: str) -> bool:
    """Check if a hostname resolves to a blocked IP address."""
    try:
        addr = ipaddress.ip_address(host)
        return any(addr in net for net in _BLOCKED_NETWORKS)
    except ValueError:
        pass  # Not an IP literal — resolve it

    try:
        results = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for family, _type, _proto, _canonname, sockaddr in results:
            ip_str = sockaddr[0]
            addr = ipaddress.ip_address(ip_str)
            if any(addr in net for net in _BLOCKED_NETWORKS):
                return True
    except socket.gaierror:
        # DNS resolution failed — treat as blocked (don't let unresolvable hosts through)
        return True

    return False


def validate_image_url(url: str) -> tuple[bool, str]:
    """
    Validate that a URL is safe for server-side fetching.

    Returns
    -------
    (is_valid, error_message)
        is_valid is True if the URL is safe, False otherwise.
        error_message is empty when valid, describes the problem otherwise.
    """
    if not url or not isinstance(url, str):
        return False, "URL is empty or not a string"

    url = url.strip()
    parsed = urlparse(url)

    # Scheme check — only HTTPS allowed
    if parsed.scheme not in ("https",):
        return False, f"Only HTTPS URLs are allowed, got '{parsed.scheme}'"

    host = parsed.hostname
    if not host:
        return False, "URL has no hostname"

    # Domain allowlist (if configured)
    if ALLOWED_DOMAINS and host not in ALLOWED_DOMAINS:
        return False, f"Domain '{host}' is not in the allowed list"

    # Block private/internal IPs
    if _is_blocked_ip(host):
        return False, f"URL resolves to a blocked internal/private IP address"

    return True, ""
