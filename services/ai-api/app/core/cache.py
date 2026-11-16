from redis.asyncio import Redis

from app.core.config import settings

redis_client = Redis.from_url(
    settings.redis_url.get_secret_value(),
    decode_responses=True,
)
