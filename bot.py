# -*- coding: utf-8 -*-
"""
Discord-бот модерации медиа.

Следит за отправкой изображений, GIF и других картинок в каналах сервера.
Каждое изображение анализируется vision-моделью Claude. Если на нём
обнаружена политика или другой запрещённый контент — сообщение удаляется,
а автору выдаётся предупреждение. После достижения лимита предупреждений
пользователь получает таймаут.

Запуск:
    DISCORD_TOKEN=... ANTHROPIC_API_KEY=... python bot.py
"""

import asyncio
import base64
import json
import logging
import os
import re
from datetime import timedelta
from pathlib import Path

import aiohttp
import discord
from anthropic import AsyncAnthropic, APIStatusError, APIConnectionError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("media-mod")

BASE_DIR = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
WARNINGS_PATH = BASE_DIR / "warnings.json"

DEFAULT_CONFIG = {
    "categories": {
        "politics": "Политика: политики, политические лозунги, партийная символика, протесты, пропаганда, военно-политическая агитация",
        "nsfw": "NSFW: обнажённое тело, порнография, откровенно сексуальный контент",
        "violence": "Жестокость: кровь, расчленение, издевательства, реальное насилие",
        "extremism": "Экстремизм: нацистская и террористическая символика, призывы к насилию",
        "drugs": "Наркотики: изображение и пропаганда наркотических веществ"
    },
    "max_warnings": 3,
    "timeout_minutes": 60,
    "delete_notice_seconds": 15,
    "ignore_moderators": True,
    "log_channel_id": None,
    "max_file_size_mb": 10
}

ALLOWED_MEDIA_TYPES = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
}

IMAGE_URL_RE = re.compile(
    r"https?://\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?", re.IGNORECASE
)
GIF_HOST_RE = re.compile(
    r"https?://(?:\w+\.)?(?:tenor\.com|giphy\.com|gfycat\.com)/\S+", re.IGNORECASE
)

VERDICT_SCHEMA = {
    "type": "object",
    "properties": {
        "violation": {"type": "boolean"},
        "category": {"type": ["string", "null"]},
        "reason": {"type": "string"},
    },
    "required": ["violation", "category", "reason"],
    "additionalProperties": False,
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        merged = dict(DEFAULT_CONFIG)
        merged.update(cfg)
        return merged
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)
    return dict(DEFAULT_CONFIG)


class WarningStore:
    """Счётчик предупреждений на диске (guild_id -> user_id -> count)."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = asyncio.Lock()
        self.data: dict = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                log.warning("warnings.json повреждён, начинаю с нуля")

    async def add(self, guild_id: int, user_id: int) -> int:
        async with self._lock:
            g = self.data.setdefault(str(guild_id), {})
            g[str(user_id)] = g.get(str(user_id), 0) + 1
            self.path.write_text(
                json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            return g[str(user_id)]

    async def reset(self, guild_id: int, user_id: int) -> None:
        async with self._lock:
            self.data.get(str(guild_id), {}).pop(str(user_id), None)
            self.path.write_text(
                json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
            )


class MediaModBot(discord.Client):
    def __init__(self, config: dict):
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True
        super().__init__(intents=intents)

        self.config = config
        self.warnings = WarningStore(WARNINGS_PATH)
        self.anthropic = AsyncAnthropic()
        self.http_session: aiohttp.ClientSession | None = None
        # Сообщения, которые уже проверены/удалены — чтобы не проверять
        # дважды при появлении embed'ов через on_message_edit.
        self.processed: set[int] = set()

    async def setup_hook(self) -> None:
        self.http_session = aiohttp.ClientSession()

    async def close(self) -> None:
        if self.http_session:
            await self.http_session.close()
        await super().close()

    async def on_ready(self):
        log.info("Бот запущен как %s (id=%s)", self.user, self.user.id)

    # ------------------------------------------------------------------ events

    async def on_message(self, message: discord.Message):
        await self._maybe_check(message, wait_for_embeds=True)

    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        # Discord добавляет embed'ы (Tenor/Giphy/прямые ссылки) через edit.
        if len(after.embeds) > len(before.embeds):
            await self._maybe_check(after, wait_for_embeds=False)

    # ------------------------------------------------------------- moderation

    async def _maybe_check(self, message: discord.Message, wait_for_embeds: bool):
        if message.author.bot or message.guild is None:
            return
        if message.id in self.processed:
            return
        if self.config.get("ignore_moderators", True) and isinstance(
            message.author, discord.Member
        ):
            if message.author.guild_permissions.manage_messages:
                return

        media = self._collect_media(message)

        # Ссылка на GIF-хостинг, но embed ещё не подгрузился — подождём и перечитаем.
        if not media and wait_for_embeds and (
            GIF_HOST_RE.search(message.content) or IMAGE_URL_RE.search(message.content)
        ):
            await asyncio.sleep(2)
            try:
                message = await message.channel.fetch_message(message.id)
            except discord.NotFound:
                return
            media = self._collect_media(message)

        if not media:
            return

        self.processed.add(message.id)
        if len(self.processed) > 5000:
            self.processed = set(list(self.processed)[-2500:])

        for url in media:
            verdict = await self._analyze_url(url)
            if verdict and verdict.get("violation"):
                await self._punish(message, verdict)
                return

    def _collect_media(self, message: discord.Message) -> list[str]:
        """Собирает URL всех картинок/гифок из сообщения."""
        urls: list[str] = []

        for att in message.attachments:
            ctype = (att.content_type or "").split(";")[0].strip().lower()
            if ctype in ALLOWED_MEDIA_TYPES:
                urls.append(att.url)
            elif att.filename.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
                urls.append(att.url)

        for emb in message.embeds:
            if emb.image and emb.image.url:
                urls.append(emb.image.url)
            elif emb.thumbnail and emb.thumbnail.url:
                urls.append(emb.thumbnail.url)
            elif emb.video and emb.video.url and emb.thumbnail and emb.thumbnail.url:
                urls.append(emb.thumbnail.url)

        # Прямые ссылки на картинки в тексте (если embed не появился)
        for m in IMAGE_URL_RE.finditer(message.content):
            urls.append(m.group(0))

        # Убираем дубли, ограничиваем количество на сообщение
        seen, result = set(), []
        for u in urls:
            if u not in seen:
                seen.add(u)
                result.append(u)
        return result[:4]

    async def _analyze_url(self, url: str) -> dict | None:
        data = await self._download(url)
        if data is None:
            return None
        media_bytes, media_type = data
        return await self._analyze_image(media_bytes, media_type)

    async def _download(self, url: str) -> tuple[bytes, str] | None:
        max_bytes = int(self.config.get("max_file_size_mb", 10)) * 1024 * 1024
        try:
            async with self.http_session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    return None
                ctype = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
                media_type = ALLOWED_MEDIA_TYPES.get(ctype)
                if media_type is None:
                    # Попробуем по расширению URL
                    low = url.lower().split("?")[0]
                    if low.endswith((".jpg", ".jpeg")):
                        media_type = "image/jpeg"
                    elif low.endswith(".png"):
                        media_type = "image/png"
                    elif low.endswith(".gif"):
                        media_type = "image/gif"
                    elif low.endswith(".webp"):
                        media_type = "image/webp"
                    else:
                        return None
                body = await resp.content.read(max_bytes + 1)
                if len(body) > max_bytes:
                    log.info("Файл больше %d МБ, пропускаю: %s", max_bytes // 1024 // 1024, url)
                    return None
                return body, media_type
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            log.warning("Не удалось скачать %s: %s", url, e)
            return None

    async def _analyze_image(self, data: bytes, media_type: str) -> dict | None:
        categories = self.config["categories"]
        category_list = "\n".join(f"- {key}: {desc}" for key, desc in categories.items())
        system = (
            "Ты — модератор изображений Discord-сервера. Тебе дают картинку или кадр GIF. "
            "Определи, нарушает ли она правила. Запрещённые категории:\n"
            f"{category_list}\n\n"
            "Отвечай строго в JSON. violation=true только если нарушение очевидно "
            "и относится к одной из категорий. Обычные мемы, игры, аниме и юмор без "
            "запрещённого содержания — не нарушение. category — ключ категории "
            f"({', '.join(categories.keys())}) или null. reason — краткое объяснение по-русски."
        )
        b64 = base64.standard_b64encode(data).decode("utf-8")
        try:
            response = await self.anthropic.messages.create(
                model="claude-opus-4-8",
                max_tokens=512,
                system=[{
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},
                }],
                output_config={"format": {"type": "json_schema", "schema": VERDICT_SCHEMA}},
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": "Проверь это изображение."},
                    ],
                }],
            )
        except APIConnectionError as e:
            log.error("Нет связи с Anthropic API: %s", e)
            return None
        except APIStatusError as e:
            log.error("Ошибка Anthropic API %s: %s", e.status_code, e.message)
            return None

        if response.stop_reason == "refusal":
            # Классификатор отказался — считаем это подозрительным контентом.
            return {
                "violation": True,
                "category": "nsfw",
                "reason": "Модель отказалась анализировать контент (высокорисковый материал).",
            }

        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            return None
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            log.error("Не удалось разобрать ответ модели: %r", text)
            return None

    async def _punish(self, message: discord.Message, verdict: dict):
        cfg = self.config
        category = verdict.get("category") or "запрещённый контент"
        reason = verdict.get("reason", "")
        author = message.author

        # 1. Удаляем сообщение
        try:
            await message.delete()
        except discord.Forbidden:
            log.error("Нет права удалять сообщения в #%s", message.channel)
        except discord.NotFound:
            pass

        # 2. Предупреждение
        count = await self.warnings.add(message.guild.id, author.id)
        max_warns = int(cfg.get("max_warnings", 3))

        notice = (
            f"{author.mention}, твоё сообщение удалено: **{category}**.\n"
            f"Предупреждение **{count}/{max_warns}**."
        )
        try:
            await message.channel.send(
                notice, delete_after=cfg.get("delete_notice_seconds", 15)
            )
        except discord.Forbidden:
            pass

        try:
            await author.send(
                f"⚠️ Твоё сообщение на сервере **{message.guild.name}** удалено.\n"
                f"Причина: {reason}\n"
                f"Предупреждение {count}/{max_warns}."
            )
        except discord.Forbidden:
            pass  # закрытые ЛС

        # 3. Таймаут при достижении лимита
        if count >= max_warns and isinstance(author, discord.Member):
            minutes = int(cfg.get("timeout_minutes", 60))
            try:
                await author.timeout(
                    timedelta(minutes=minutes),
                    reason=f"Лимит предупреждений ({max_warns}) за запрещённый контент",
                )
                await self.warnings.reset(message.guild.id, author.id)
                try:
                    await message.channel.send(
                        f"🔇 {author.mention} получает таймаут на {minutes} мин. "
                        f"(достигнут лимит предупреждений)",
                        delete_after=cfg.get("delete_notice_seconds", 15),
                    )
                except discord.Forbidden:
                    pass
            except discord.Forbidden:
                log.error("Нет права выдавать таймаут %s", author)

        # 4. Лог в модераторский канал
        log_channel_id = cfg.get("log_channel_id")
        if log_channel_id:
            channel = message.guild.get_channel(int(log_channel_id))
            if channel:
                embed = discord.Embed(
                    title="Удалено медиа",
                    color=discord.Color.red(),
                    description=(
                        f"**Автор:** {author.mention} (`{author.id}`)\n"
                        f"**Канал:** {message.channel.mention}\n"
                        f"**Категория:** {category}\n"
                        f"**Причина:** {reason}\n"
                        f"**Предупреждений:** {count}/{max_warns}"
                    ),
                )
                try:
                    await channel.send(embed=embed)
                except discord.Forbidden:
                    pass

        log.info(
            "Удалено сообщение %s от %s: %s (%s) — пред %d/%d",
            message.id, author, category, reason, count, max_warns,
        )


def main():
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        raise SystemExit("Не задан DISCORD_TOKEN (переменная окружения)")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("Не задан ANTHROPIC_API_KEY (переменная окружения)")

    config = load_config()
    bot = MediaModBot(config)
    bot.run(token)


if __name__ == "__main__":
    main()
