from __future__ import annotations

import os
from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandStart
from aiogram.types import Message, WebAppInfo, KeyboardButton
from aiogram.utils.keyboard import ReplyKeyboardBuilder

from backend.config import load_env, require_env


def build_main_kb(webapp_url: str):
    kb = ReplyKeyboardBuilder()
    kb.add(KeyboardButton(text="Играть", web_app=WebAppInfo(url=webapp_url)))
    kb.add(KeyboardButton(text="Таблица лидеров", web_app=WebAppInfo(url=webapp_url + "#/leaders")))
    kb.adjust(1)
    return kb.as_markup(resize_keyboard=True)


async def start_handler(message: Message) -> None:
    webapp_url = require_env("WEBAPP_URL")
    await message.answer(
        "Мини-игра: лови яйца (3 дорожки), свайпы для управления. Промах — конец игры.",
        reply_markup=build_main_kb(webapp_url),
    )


def main() -> None:
    load_env()
    token = require_env("TELEGRAM_BOT_TOKEN")

    bot = Bot(token=token)
    dp = Dispatcher()

    dp.message.register(start_handler, CommandStart())

    # страховка: если пользователь пишет "играть"
    @dp.message(F.text.lower() == "играть")
    async def _play(m: Message) -> None:
        await start_handler(m)

    dp.run_polling(bot)


if __name__ == "__main__":
    main()


