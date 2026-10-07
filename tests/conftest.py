import os
from collections.abc import AsyncIterator
from uuid import uuid4

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.schema import CreateSchema, DropSchema

from taskflow.cache import TaskCache, get_cache
from taskflow.database import get_session
from taskflow.main import app
from taskflow.models import Base


class MemoryRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(self, key: str, value: str, ex: int) -> None:
        self.values[key] = value

    async def delete(self, key: str) -> None:
        self.values.pop(key, None)


@pytest_asyncio.fixture
async def client() -> AsyncIterator[tuple[AsyncClient, MemoryRedis]]:
    database_url = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    engine = create_async_engine(database_url)
    schema = f"test_{uuid4().hex}" if engine.dialect.name == "postgresql" else None
    if schema:
        async with engine.begin() as connection:
            await connection.execute(CreateSchema(schema))
        test_engine = engine.execution_options(schema_translate_map={None: schema})
    else:
        test_engine = engine

    try:
        async with test_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(test_engine, expire_on_commit=False)
        redis = MemoryRedis()
        cache = TaskCache(redis, ttl_seconds=60)

        async def override_session() -> AsyncIterator[AsyncSession]:
            async with factory() as session:
                yield session

        app.dependency_overrides[get_session] = override_session
        app.dependency_overrides[get_cache] = lambda: cache
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
            yield http, redis
    finally:
        app.dependency_overrides.clear()
        if schema:
            async with engine.begin() as connection:
                await connection.execute(DropSchema(schema, cascade=True))
        await engine.dispose()
