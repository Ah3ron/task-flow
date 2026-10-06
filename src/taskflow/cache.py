import logging

from fastapi import Request
from pydantic import ValidationError
from redis.asyncio import Redis
from redis.exceptions import RedisError

from taskflow.schemas import TaskRead

logger = logging.getLogger(__name__)


class TaskCache:
    def __init__(self, client: Redis, ttl_seconds: int) -> None:
        self.client = client
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def key(task_id: int) -> str:
        return f"task:{task_id}"

    async def get(self, task_id: int) -> TaskRead | None:
        try:
            value = await self.client.get(self.key(task_id))
            return TaskRead.model_validate_json(value) if value is not None else None
        except (RedisError, ValidationError):
            logger.warning("Could not read task cache", exc_info=True)
            return None

    async def set(self, task: TaskRead) -> None:
        try:
            await self.client.set(self.key(task.id), task.model_dump_json(), ex=self.ttl_seconds)
        except RedisError:
            logger.warning("Could not write task cache", exc_info=True)

    async def invalidate(self, task_id: int) -> None:
        try:
            await self.client.delete(self.key(task_id))
        except RedisError:
            logger.warning("Could not invalidate task cache", exc_info=True)


def get_cache(request: Request) -> TaskCache:
    return request.app.state.task_cache
