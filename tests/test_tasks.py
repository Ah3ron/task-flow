from conftest import MemoryRedis
from httpx import AsyncClient


async def test_task_lifecycle_and_cache(client: tuple[AsyncClient, MemoryRedis]) -> None:
    http, redis = client
    created = await http.post("/tasks", json={"title": "  Write tests  ", "description": "first"})
    assert created.status_code == 201
    task = created.json()
    assert task["title"] == "Write tests"
    assert task["status"] == "todo"
    assert task["created_at"] and task["updated_at"]
    task_id = task["id"]

    assert (await http.get(f"/tasks/{task_id}")).json() == task
    assert f"task:{task_id}" in redis.values
    updated = await http.patch(f"/tasks/{task_id}", json={"status": "done", "description": None})
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"
    assert updated.json()["description"] is None
    assert f"task:{task_id}" not in redis.values
    assert (await http.get(f"/tasks/{task_id}")).json()["status"] == "done"

    deleted = await http.delete(f"/tasks/{task_id}")
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert f"task:{task_id}" not in redis.values
    assert (await http.get(f"/tasks/{task_id}")).status_code == 404


async def test_list_filter_and_pagination(client: tuple[AsyncClient, MemoryRedis]) -> None:
    http, _ = client
    for title, task_status in [("one", "todo"), ("two", "done"), ("three", "done")]:
        assert (
            await http.post("/tasks", json={"title": title, "status": task_status})
        ).status_code == 201
    response = await http.get("/tasks", params={"status": "done", "limit": 1, "offset": 1})
    assert response.status_code == 200
    assert [task["title"] for task in response.json()] == ["three"]
    assert (await http.get("/tasks", params={"limit": 101})).status_code == 422
    assert (await http.get("/tasks", params={"offset": -1})).status_code == 422


async def test_validation_and_missing_tasks(client: tuple[AsyncClient, MemoryRedis]) -> None:
    http, _ = client
    assert (await http.get("/health")).json() == {"status": "ok"}
    for payload in [{}, {"title": "   "}, {"title": "x" * 201}, {"title": "ok", "status": "bad"}]:
        assert (await http.post("/tasks", json=payload)).status_code == 422
    created = (await http.post("/tasks", json={"title": "valid"})).json()
    for payload in [{"title": None}, {"status": None}, {"title": ""}, {"status": "bad"}]:
        assert (await http.patch(f"/tasks/{created['id']}", json=payload)).status_code == 422
    assert (await http.patch("/tasks/9999", json={"title": "x"})).status_code == 404
    assert (await http.delete("/tasks/9999")).status_code == 404
