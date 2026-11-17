from __future__ import annotations

from prometheus_client import (
    CollectorRegistry,
    Counter,
    GCCollector,
    Histogram,
    ProcessCollector,
)

REGISTRY = CollectorRegistry()
ProcessCollector(registry=REGISTRY)
GCCollector(registry=REGISTRY)

HTTP_REQUESTS = Counter(
    "unimind_http_requests_total",
    "HTTP requests served by the UniMind API.",
    ("method", "route", "status"),
    registry=REGISTRY,
)
HTTP_REQUEST_DURATION = Histogram(
    "unimind_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ("method", "route"),
    registry=REGISTRY,
)
AGENT_EXECUTIONS = Counter(
    "unimind_agent_executions_total",
    "Agent executions by agent and outcome.",
    ("agent", "outcome"),
    registry=REGISTRY,
)
AGENT_EXECUTION_DURATION = Histogram(
    "unimind_agent_execution_duration_seconds",
    "Agent execution duration in seconds.",
    ("agent",),
    registry=REGISTRY,
)
