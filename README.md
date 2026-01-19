# Finnik mini-app (Telegram WebApp game)

Мини-игра в Telegram по типу “лови кексы”: 3 дорожки (left/middle/right), управление свайпами, промах по кексу = конец игры, бомба при поимке = конец игры.

## Архитектура
- `backend/` — FastAPI: отдаёт WebApp (статику) и API для лидербордов/сабмита результатов.
- `bot/` — aiogram бот: `/start` + кнопки для открытия WebApp.
- `webapp/` — фронтенд мини-аппа (Canvas).

## Быстрый старт (dev)
### 1) Установить зависимости
```bash
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
```

### 2) Настроить переменные окружения
В этом окружении создание `.env` может быть ограничено, поэтому используйте файл `env.template`.

- Скопируйте `env.template` в `env.local`
- Заполните `TELEGRAM_BOT_TOKEN` и `WEBAPP_URL`

#### Что такое `WEBAPP_URL` и где его взять
`WEBAPP_URL` — **публичный URL, по которому Telegram откроет WebApp**. В этом проекте фронтенд раздаётся самим FastAPI по корню `/`, поэтому обычно это **адрес backend’а**.

- Dev (локально): подними backend на `http://127.0.0.1:8000`, затем сделай HTTPS-туннель на этот порт (например, ngrok или Cloudflare Tunnel) и возьми выданный `https://...`.
  - Пример значения: `WEBAPP_URL=https://your-tunnel.example`
- Prod: задеплой backend (Render/Fly.io/Railway/VPS) и укажи домен вида `https://your-domain`.

### 3) Запустить backend
```bash
copy env.template env.local
notepad env.local
.\.venv\Scripts\python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

### 3.1)
```bash
ssh -R 80:localhost:8000 ssh.localhost.run
```

### 4) Запустить bot (в другом терминале)
```bash
python -m bot.main
```

## Переменные окружения
- `TELEGRAM_BOT_TOKEN` — токен бота от BotFather
- `WEBAPP_URL` — публичный URL, по которому Telegram откроет WebApp (в проде нужен HTTPS)
- `DB_PATH` — путь к SQLite БД (по умолчанию `./data.sqlite3`)


