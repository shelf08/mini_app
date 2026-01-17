from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.api import api_router
from backend.config import load_env
from backend.db import init_db


ROOT = Path(__file__).resolve().parent.parent
WEBAPP_DIR = ROOT / "webapp"


app = FastAPI(title="Finnik Mini App API")
app.include_router(api_router, prefix="/api")

app.mount("/", StaticFiles(directory=str(WEBAPP_DIR), html=True), name="webapp")


@app.on_event("startup")
def _startup() -> None:
    load_env()
    db_path = os.getenv("DB_PATH", str(ROOT / "data.sqlite3"))
    init_db(db_path)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


