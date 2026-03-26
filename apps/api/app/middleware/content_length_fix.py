"""
Content-Length Fix Middleware
Prevents 'Response content longer than Content-Length' errors by removing
Content-Length and Transfer-Encoding headers at the ASGI layer.
"""
from typing import Callable


class ContentLengthFixMiddleware:
    """
    Strip Content-Length/Transfer-Encoding from response headers.

    This avoids mismatches when downstream middleware mutates headers
    after a response body length has already been calculated.
    """

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        async def send_wrapper(message):
            if message.get("type") == "http.response.start":
                headers = message.get("headers", [])
                filtered = [
                    (k, v)
                    for k, v in headers
                    if k.lower() not in (b"content-length", b"transfer-encoding")
                ]
                message = {**message, "headers": filtered}
            await send(message)

        await self.app(scope, receive, send_wrapper)
