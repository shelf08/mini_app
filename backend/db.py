from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal, TypedDict


Period = Literal["week", "month", "all"]

_DB_PATH: str | None = None


class UserRow(TypedDict):
    telegram_user_id: int
    first_name: str
    username: str
    best_all_time: int
    best_week: int
    best_week_reset_at: str
    best_month: int
    best_month_reset_at: str


def init_db(db_path: str) -> None:
    global _DB_PATH
    _DB_PATH = db_path
    _ensure_parent_dir(db_path)
    with _conn() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              telegram_user_id INTEGER PRIMARY KEY,
              first_name TEXT NOT NULL DEFAULT '',
              username TEXT NOT NULL DEFAULT '',
              best_all_time INTEGER NOT NULL DEFAULT 0,
              best_week INTEGER NOT NULL DEFAULT 0,
              best_week_reset_at TEXT NOT NULL,
              best_month INTEGER NOT NULL DEFAULT 0,
              best_month_reset_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _ensure_parent_dir(path: str) -> None:
    parent = os.path.dirname(os.path.abspath(path))
    if parent and not os.path.exists(parent):
        os.makedirs(parent, exist_ok=True)


@contextmanager
def _conn() -> sqlite3.Connection:
    if not _DB_PATH:
        raise RuntimeError("DB is not initialized (call init_db first)")
    conn = sqlite3.connect(_DB_PATH, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def _week_reset_at(now: datetime) -> datetime:
    # ISO week: Monday 00:00 UTC
    now = now.astimezone(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _month_reset_at(now: datetime) -> datetime:
    now = now.astimezone(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def get_or_create_user(telegram_user_id: int, first_name: str, username: str) -> UserRow:
    now = datetime.now(timezone.utc)
    week_reset = _week_reset_at(now)
    month_reset = _month_reset_at(now)

    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO users(
                  telegram_user_id, first_name, username,
                  best_all_time, best_week, best_week_reset_at,
                  best_month, best_month_reset_at
                ) VALUES(?, ?, ?, 0, 0, ?, 0, ?)
                """,
                (telegram_user_id, first_name, username, _iso(week_reset), _iso(month_reset)),
            )
        else:
            conn.execute(
                "UPDATE users SET first_name = ?, username = ? WHERE telegram_user_id = ?",
                (first_name, username, telegram_user_id),
            )
    return get_me(telegram_user_id)


def _maybe_roll_periods(conn: sqlite3.Connection, telegram_user_id: int, now: datetime) -> None:
    row = conn.execute(
        "SELECT best_week_reset_at, best_month_reset_at FROM users WHERE telegram_user_id = ?",
        (telegram_user_id,),
    ).fetchone()
    if row is None:
        return

    now = now.astimezone(timezone.utc)
    current_week = _week_reset_at(now)
    current_month = _month_reset_at(now)

    prev_week = datetime.fromisoformat(row["best_week_reset_at"])
    prev_month = datetime.fromisoformat(row["best_month_reset_at"])

    if prev_week < current_week:
        conn.execute(
            "UPDATE users SET best_week = 0, best_week_reset_at = ? WHERE telegram_user_id = ?",
            (_iso(current_week), telegram_user_id),
        )
    if prev_month < current_month:
        conn.execute(
            "UPDATE users SET best_month = 0, best_month_reset_at = ? WHERE telegram_user_id = ?",
            (_iso(current_month), telegram_user_id),
        )


def submit_score(telegram_user_id: int, score: int, now: datetime) -> None:
    with _conn() as conn:
        _maybe_roll_periods(conn, telegram_user_id, now)
        row = conn.execute(
            """
            SELECT best_all_time, best_week, best_month
            FROM users
            WHERE telegram_user_id = ?
            """,
            (telegram_user_id,),
        ).fetchone()
        if row is None:
            # защитный случай: создадим
            get_or_create_user(telegram_user_id, "", "")
            row = conn.execute(
                "SELECT best_all_time, best_week, best_month FROM users WHERE telegram_user_id = ?",
                (telegram_user_id,),
            ).fetchone()

        best_all = int(row["best_all_time"])
        best_week = int(row["best_week"])
        best_month = int(row["best_month"])

        new_all = max(best_all, score)
        new_week = max(best_week, score)
        new_month = max(best_month, score)

        conn.execute(
            """
            UPDATE users
            SET best_all_time = ?, best_week = ?, best_month = ?
            WHERE telegram_user_id = ?
            """,
            (new_all, new_week, new_month, telegram_user_id),
        )


def get_me(telegram_user_id: int) -> UserRow:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE telegram_user_id = ?",
            (telegram_user_id,),
        ).fetchone()
        if row is None:
            raise KeyError("user not found")
        return UserRow(**dict(row))  # type: ignore[arg-type]


def get_leaderboard(period: Period, limit: int) -> list[dict]:
    col = {"all": "best_all_time", "week": "best_week", "month": "best_month"}[period]
    with _conn() as conn:
        rows = conn.execute(
            f"""
            SELECT telegram_user_id, first_name, username, {col} AS score
            FROM users
            ORDER BY score DESC, telegram_user_id ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows if int(r["score"]) > 0]


