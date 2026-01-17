# Finnik mini-app (Telegram WebApp game)

Мини-игра в Telegram по типу “волк ловит яйца”: 3 дорожки (left/middle/right), управление свайпами, промах по яйцу = конец игры, бомба при поимке = конец игры.

## Архитектура
- `backend/` — FastAPI: отдаёт WebApp (статику) и API для лидербордов/сабмита результатов.
- `bot/` — aiogram бот: `/start` + кнопки для открытия WebApp.
- `webapp/` — фронтенд мини-аппа (Canvas).

## Быстрый старт (dev)
### 1) Установить зависимости
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2) Настроить переменные окружения
В этом окружении создание `.env` может быть ограничено, поэтому используйте файл `env.template`.

- Скопируйте `env.template` в `env.local`
- Заполните `TELEGRAM_BOT_TOKEN` и `WEBAPP_URL`

### 3) Запустить backend
```bash
copy env.template env.local
notepad env.local
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

### 4) Запустить bot (в другом терминале)
```bash
python -m bot.main
```

## Переменные окружения
- `TELEGRAM_BOT_TOKEN` — токен бота от BotFather
- `WEBAPP_URL` — публичный URL, по которому Telegram откроет WebApp (в проде нужен HTTPS)
- `DB_PATH` — путь к SQLite БД (по умолчанию `./data.sqlite3`)


