from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.core import rate_limit
from app.core.rate_limit import RedisRateLimitMiddleware


class FakeRedis:
    def __init__(self) -> None:
        self.count = 0
        self.fail = False

    async def eval(self, *_args: object) -> list[int]:
        if self.fail:
            raise RedisError("redis unavailable")
        self.count += 1
        return [self.count, 60]


def _limited_app(redis: FakeRedis, monkeypatch) -> FastAPI:
    application = FastAPI()
    application.add_middleware(
        RedisRateLimitMiddleware,
        max_requests=2,
        window_seconds=60,
    )

    @application.get("/api/v1/agents/test")
    async def route() -> dict[str, bool]:
        return {"ok": True}

    monkeypatch.setattr(rate_limit, "redis_client", redis)
    return application


def test_redis_rate_limiter_returns_429_and_headers(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "api_rate_limit_enabled", True)
    redis = FakeRedis()
    with TestClient(_limited_app(redis, monkeypatch)) as client:
        assert client.get("/api/v1/agents/test").status_code == 200
        response = client.get("/api/v1/agents/test")
        assert response.status_code == 200
        assert response.headers["X-RateLimit-Remaining"] == "0"
        rejected = client.get("/api/v1/agents/test")

    assert rejected.status_code == 429
    assert rejected.headers["Retry-After"] == "60"
    assert rejected.json() == {"detail": "Too many requests"}


def test_rate_limiter_fails_closed_if_redis_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "api_rate_limit_enabled", True)
    redis = FakeRedis()
    redis.fail = True
    with TestClient(_limited_app(redis, monkeypatch)) as client:
        response = client.get("/api/v1/agents/test")

    assert response.status_code == 503
    assert response.json() == {"detail": "Request protection is temporarily unavailable"}
