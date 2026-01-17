from __future__ import annotations

import hashlib
import hmac
import json
import urllib.parse
from typing import Any


def _build_data_check_string(params: dict[str, str]) -> str:
    pairs = []
    for k in sorted(params.keys()):
        pairs.append(f"{k}={params[k]}")
    return "\n".join(pairs)


def validate_webapp_init_data(init_data: str, bot_token: str) -> dict[str, Any]:
    """
    Валидация Telegram WebApp initData.

    Возвращает распарсенные данные (включая user), если подпись корректна.
    Бросает ValueError при ошибке.
    """

    if not init_data:
        raise ValueError("initData is empty")

    parsed = urllib.parse.parse_qs(init_data, strict_parsing=True)
    flat: dict[str, str] = {k: v[0] for k, v in parsed.items() if v}

    received_hash = flat.pop("hash", None)
    if not received_hash:
        raise ValueError("initData hash missing")

    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()

    data_check_string = _build_data_check_string(flat)
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise ValueError("initData signature invalid")

    # user приходит JSON-строкой
    if "user" in flat:
        try:
            flat["user"] = json.loads(flat["user"])  # type: ignore[assignment]
        except Exception as e:
            raise ValueError(f"initData user parse error: {e}")

    return flat  # type: ignore[return-value]


