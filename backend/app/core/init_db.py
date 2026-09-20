"""Apply ``migrations/*.sql`` in name order on startup."""
import os
import sqlite3

CORE_DIR = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS_DIR = os.path.join(CORE_DIR, "migrations")
DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(CORE_DIR)), "data", "history.db")


def ensure_local_db(db_path: str | None = None) -> str:
    path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with sqlite3.connect(path) as conn:
        for name in sorted(n for n in os.listdir(MIGRATIONS_DIR) if n.endswith(".sql")):
            sql = open(os.path.join(MIGRATIONS_DIR, name), encoding="utf-8").read()
            try:
                conn.executescript(sql)
            except sqlite3.OperationalError as e:
                if "duplicate column name" not in str(e).lower():
                    raise
        conn.commit()
    return path
