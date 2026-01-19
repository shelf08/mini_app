from __future__ import annotations

import logging
import os
import sys
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, WebAppInfo, KeyboardButton
from aiogram.utils.keyboard import ReplyKeyboardBuilder

from backend.config import load_env, require_env


def setup_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper().strip()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        stream=sys.stdout,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


logger = logging.getLogger("bot")


def build_main_kb(webapp_url: str):
    kb = ReplyKeyboardBuilder()
    kb.add(KeyboardButton(text="Играть", web_app=WebAppInfo(url=webapp_url)))
    kb.add(KeyboardButton(text="Таблица лидеров", web_app=WebAppInfo(url=webapp_url + "#/leaders")))
    kb.adjust(1)
    return kb.as_markup(resize_keyboard=True)


async def start_handler(message: Message) -> None:
    webapp_url = require_env("WEBAPP_URL")
    await message.answer(
        "Мини-игра: Лови кексы (3 дорожки), свайпы для управления. Не поймал - проиграл.\n"
        "Удачи <3",
        reply_markup=build_main_kb(webapp_url),
    )


def main() -> None:
    load_env()
    setup_logging()
    logger.info("Starting bot...")
    token = require_env("TELEGRAM_BOT_TOKEN")
    logger.info("Env loaded. WEBAPP_URL=%s", os.getenv("WEBAPP_URL", ""))

    bot = Bot(token=token)
    dp = Dispatcher()

    dp.message.register(start_handler, CommandStart())

    # страховка: если пользователь пишет "играть"
    @dp.message(F.text.lower() == "играть")
    async def _play(m: Message) -> None:
        await start_handler(m)

    logger.info("Polling started. Press Ctrl+C to stop.")
    try:
        dp.run_polling(bot)
    except KeyboardInterrupt:
        logger.info("Bot stopped (KeyboardInterrupt).")
    except Exception:
        logger.exception("Bot crashed with an unexpected error.")
        raise


if __name__ == "__main__":
    main()


