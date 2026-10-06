from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from taskflow.cache import TaskCache, get_cache
from taskflow.config import get_settings
from taskflow.database import get_session
from taskflow.models import Task, TaskStatus
from taskflow.schemas import TaskCreate, TaskRead, TaskUpdate


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    redis = Redis.from_url(
        settings.redis_url, decode_responses=True, socket_connect_timeout=0.3, socket_timeout=0.3
    )
    app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app.state.task_cache = TaskCache(redis, settings.cache_ttl_seconds)
    try:
        yield
    finally:
        await redis.aclose()
        await engine.dispose()


app = FastAPI(title="TaskFlow", version="0.1.0", lifespan=lifespan)
Session = Annotated[AsyncSession, Depends(get_session)]
Cache = Annotated[TaskCache, Depends(get_cache)]


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED, tags=["tasks"])
async def create_task(payload: TaskCreate, session: Session) -> Task:
    task = Task(**payload.model_dump())
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


@app.get("/tasks", response_model=list[TaskRead], tags=["tasks"])
async def list_tasks(
    session: Session,
    task_status: Annotated[TaskStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Task]:
    query = select(Task).order_by(Task.id).limit(limit).offset(offset)
    if task_status is not None:
        query = query.where(Task.status == task_status)
    return list((await session.scalars(query)).all())


async def find_task(task_id: int, session: AsyncSession) -> Task:
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/tasks/{task_id}", response_model=TaskRead, tags=["tasks"])
async def get_task(task_id: int, session: Session, cache: Cache) -> TaskRead:
    cached = await cache.get(task_id)
    if cached is not None:
        return cached
    task = TaskRead.model_validate(await find_task(task_id, session))
    await cache.set(task)
    return task


@app.patch("/tasks/{task_id}", response_model=TaskRead, tags=["tasks"])
async def update_task(task_id: int, payload: TaskUpdate, session: Session, cache: Cache) -> Task:
    task = await find_task(task_id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await session.commit()
    await cache.invalidate(task_id)
    await session.refresh(task)
    return task


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["tasks"])
async def delete_task(task_id: int, session: Session, cache: Cache) -> Response:
    task = await find_task(task_id, session)
    await session.delete(task)
    await session.commit()
    await cache.invalidate(task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
