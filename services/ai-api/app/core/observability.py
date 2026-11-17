from __future__ import annotations

import json
import logging
import re
import time
from contextvars import ContextVar
from datetime import UTC, datetime
from uuid import UUID, uuid4

from ai.telemetry import HTTP_REQUEST_DURATION, HTTP_REQUESTS
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)
request_id_context: ContextVar[str] = ContextVar("request_id", default="-")
_REQUEST_ID_PATTERN = re.compile(r"^[0-9a-fA-F-]{36}$")
_HTTP_METHODS = frozenset(
    {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT"}
)


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_context.get(),
        }
        for field in (
            "method",
            "route",
            "status_code",
            "duration_seconds",
            "agent",
            "error_type",
            "outcome",
        ):
            value = getattr(record, field, None)
            if value is not None:
                entry[field] = value
        if record.exc_info:
            entry["exception_type"] = record.exc_info[0].__name__
        agent_request_id = getattr(record, "request_id", None)
        if agent_request_id is not None:
            entry["agent_request_id"] = agent_request_id
        return json.dumps(entry, separators=(",", ":"))


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)


class RequestObservabilityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _request_id(scope)
        context_token = request_id_context.set(request_id)
        started = time.perf_counter()
        status_code = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            duration = time.perf_counter() - started
            raw_method = scope.get("method", "UNKNOWN")
            method = raw_method if raw_method in _HTTP_METHODS else "OTHER"
            route = getattr(scope.get("route"), "path", "unmatched")
            status = f"{status_code // 100}xx"
            HTTP_REQUESTS.labels(method, route, status).inc()
            HTTP_REQUEST_DURATION.labels(method, route).observe(duration)
            logger.info(
                "http_request",
                extra={
                    "method": method,
                    "route": route,
                    "status_code": status_code,
                    "duration_seconds": round(duration, 6),
                },
            )
            request_id_context.reset(context_token)


def _request_id(scope: Scope) -> str:
    raw_headers = scope.get("headers", [])
    for name, value in raw_headers:
        if name.lower() == b"x-request-id":
            candidate = value.decode("ascii", errors="ignore")
            if _REQUEST_ID_PATTERN.fullmatch(candidate):
                try:
                    return str(UUID(candidate))
                except ValueError:
                    break
            break
    return str(uuid4())
