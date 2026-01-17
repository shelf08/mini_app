from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.db import (
    get_leaderboard,
    get_me,
    get_or_create_user,
    submit_score,
)
from backend.config import require_env
from backend.telegram_auth import validate_webapp_init_data


api_router = APIRouter()


Period = Literal["week", "month", "all"]


class SubmitScoreIn(BaseModel):
    initData: str = Field(min_length=1)
    score: int = Field(ge=0, le=10_000_000)
    duration_ms: int | None = Field(default=None, ge=0, le=86_400_000)
    client_version: str | None = Field(default=None, max_length=64)


class SubmitScoreOut(BaseModel):
    ok: bool
    user_id: int
    best_all: int
    best_week: int
    best_month: int


@api_router.post("/score/submit", response_model=SubmitScoreOut)
def api_submit_score(payload: SubmitScoreIn) -> SubmitScoreOut:
    try:
        token = require_env("TELEGRAM_BOT_TOKEN")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        auth = validate_webapp_init_data(payload.initData, bot_token=token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))

    tg_user = auth["user"]
    user = get_or_create_user(
        telegram_user_id=int(tg_user["id"]),
        first_name=str(tg_user.get("first_name") or ""),
        username=str(tg_user.get("username") or ""),
    )

    now = datetime.now(timezone.utc)
    submit_score(
        telegram_user_id=user["telegram_user_id"],
        score=payload.score,
        now=now,
    )

    me = get_me(user["telegram_user_id"])
    return SubmitScoreOut(
        ok=True,
        user_id=user["telegram_user_id"],
        best_all=me["best_all_time"],
        best_week=me["best_week"],
        best_month=me["best_month"],
    )


@api_router.get("/leaderboard")
def api_leaderboard(period: Period = "all", limit: int = 50) -> dict:
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be in [1, 200]")
    rows = get_leaderboard(period=period, limit=limit)
    return {"period": period, "items": rows}


