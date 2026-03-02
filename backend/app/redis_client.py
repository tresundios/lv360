"""
Redis client singleton for caching layer.
"""

import redis

from app.config import get_settings


def get_redis_client() -> redis.Redis:
    settings = get_settings()
    return redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=0,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
    )


def check_redis_health() -> bool:
    try:
        client = get_redis_client()
        return client.ping()
    except Exception:
        return False
