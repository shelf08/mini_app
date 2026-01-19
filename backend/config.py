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

    # Если переменная уже существует, но пустая, python-dotenv с override=False
    # не перезапишет её значением из файла. Убираем такие "пустые" значения,
    # чтобы `env.local` мог корректно подхватиться.
    for k in ("TELEGRAM_BOT_TOKEN", "WEBAPP_URL", "DB_PATH", "LOG_LEVEL"):
        v = os.getenv(k)
        if v is not None and not v.strip():
            os.environ.pop(k, None)

    # Важно: `env.local` должен иметь приоритет над `.env`.
    # Иначе пустые значения в `.env` могут "заблокировать" значения из `env.local`
    # при `override=False`.
    candidates = [
        ROOT / "env.local",
        ROOT / ".env",
    ]
    for p in candidates:
        if p.exists():
            load_dotenv(dotenv_path=str(p), override=False)


def require_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Env var {name} is required")
    return v


