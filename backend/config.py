from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    """
    Загружаем переменные окружения из файлов (если они есть).
    `.env` может быть запрещён в некоторых окружениях, поэтому поддерживаем `env.local`.
    """

    candidates = [
        ROOT / ".env",
        ROOT / "env.local",
    ]
    for p in candidates:
        if p.exists():
            load_dotenv(dotenv_path=str(p), override=False)


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Env var {name} is required")
    return v


