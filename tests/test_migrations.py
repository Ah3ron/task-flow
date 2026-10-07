import os
import sqlite3
import subprocess
import sys


def test_migration_upgrade_and_downgrade(tmp_path) -> None:
    database = tmp_path / "migration.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{database}"}
    command = [sys.executable, "-m", "alembic"]
    subprocess.run([*command, "upgrade", "head"], env=env, check=True, capture_output=True)
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
        ).fetchone() == ("tasks",)
    subprocess.run([*command, "downgrade", "base"], env=env, check=True, capture_output=True)
    with sqlite3.connect(database) as connection:
        assert (
            connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
            ).fetchone()
            is None
        )
