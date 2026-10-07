import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from redis.asyncio import Redis
from redis.exceptions import ConnectionError

from taskflow.cache import TaskCache
from taskflow.schemas import TaskRead


def sample_task() -> TaskRead:
    return TaskRead(
        id=1,
        title="test",
        description=None,
        status="todo",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


async def test_cache_roundtrip_and_ttl() -> None:
    redis = AsyncMock()
    task = sample_task()
    redis.get.return_value = task.model_dump_json()
    cache = TaskCache(redis, 42)
    assert await cache.get(1) == task
    await cache.set(task)
    redis.set.assert_awaited_once_with("task:1", task.model_dump_json(), ex=42)
    await cache.invalidate(1)
    redis.delete.assert_awaited_once_with("task:1")


async def test_cache_failure_is_nonfatal() -> None:
    redis = AsyncMock()
    redis.get.side_effect = ConnectionError("offline")
    redis.set.side_effect = ConnectionError("offline")
    redis.delete.side_effect = ConnectionError("offline")
    cache = TaskCache(redis, 60)
    assert await cache.get(1) is None
    await cache.set(sample_task())
    await cache.invalidate(1)


async def test_invalid_cached_value_is_a_miss() -> None:
    redis = AsyncMock()
    redis.get.return_value = "not json"
    assert await TaskCache(redis, 60).get(1) is None


@pytest.mark.skipif(not os.getenv("TEST_REDIS_URL"), reason="TEST_REDIS_URL is not set")
async def test_real_redis_roundtrip() -> None:
    redis = Redis.from_url(os.environ["TEST_REDIS_URL"], decode_responses=True)
    cache = TaskCache(redis, 60)
    task = sample_task().model_copy(update={"id": uuid4().int % 10**16})
    try:
        await cache.set(task)
        assert await cache.get(task.id) == task
        assert 0 < await redis.ttl(cache.key(task.id)) <= 60
        await cache.invalidate(task.id)
        assert await cache.get(task.id) is None
    finally:
        await redis.delete(cache.key(task.id))
        await redis.aclose()
