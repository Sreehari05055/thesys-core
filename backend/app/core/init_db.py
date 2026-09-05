"""Apply ``init.sql`` to the local SQLite file (CREATE IF NOT EXISTS)."""
import os
import sqlite3

CORE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(CORE_DIR, "init.sql")
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(CORE_DIR)), "data", "history.db")


def ensure_local_db(db_path: str | None = None) -> str:
    path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        sql = f.read()
    with sqlite3.connect(path) as conn:
        conn.executescript(sql)
        conn.commit()
    return path
