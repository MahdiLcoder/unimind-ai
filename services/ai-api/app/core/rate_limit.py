from __future__ import annotations

import hashlib
import logging

from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.cache import redis_client
from app.core.config import settings

logger = logging.getLogger(__name__)

_INCREMENT_FIXED_WINDOW = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
"""


class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    """Shared, atomic IP rate limiting for API requests using Redis."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        max_requests: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        super().__init__(app)
        self.max_requests = max_requests or settings.api_rate_limit_requests
        self.window_seconds = window_seconds or settings.api_rate_limit_window_seconds

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        path = request.url.path
        if not settings.rate_limit_enabled or not path.startswith("/api/v1/"):
            return await call_next(request)

        remote_address = request.client.host if request.client else "unknown"
        address_digest = hashlib.sha256(remote_address.encode("utf-8")).hexdigest()
        route_group = "/".join(path.split("/")[:4])
        key = f"rate-limit:v1:{route_group}:{address_digest}"
        try:
            result = await redis_client.eval(
                _INCREMENT_FIXED_WINDOW,
                1,
                key,
                self.window_seconds,
            )
            count, ttl = int(result[0]), max(int(result[1]), 1)
        except (RedisError, OSError, TypeError, ValueError) as exc:
            logger.error(
                "Rate limiter storage is unavailable",
                extra={"route_group": route_group, "error_type": type(exc).__name__},
            )
            return JSONResponse(
                status_code=503,
                content={"detail": "Request protection is temporarily unavailable"},
                headers={"Retry-After": str(self.window_seconds)},
            )

        if count > self.max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={
                    "Retry-After": str(ttl),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(self.max_requests - count)
        return response
