# -*- coding: utf-8 -*-
"""
Локальный бесплатный классификатор изображений на базе CLIP (OpenAI, open-source).

Модель скачивается один раз с HuggingFace (~600 МБ) и дальше работает
полностью офлайн, без API-ключей и оплаты. Работает на CPU; GPU
используется автоматически, если доступен.

Принцип: zero-shot классификация — картинка сравнивается с текстовыми
описаниями запрещённых категорий и с описаниями "безопасного" контента.
Если суммарная вероятность какой-то запрещённой категории выше порога —
это нарушение.
"""

import io
import logging

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

log = logging.getLogger("media-mod.classifier")

MODEL_NAME = "openai/clip-vit-base-patch32"
MAX_GIF_FRAMES = 3  # сколько кадров GIF проверять (первый, середина, последний)


class MediaClassifier:
    def __init__(self, categories: dict, safe_prompts: list[str], threshold: float):
        """
        categories: {"politics": {"label": "Политика", "prompts": ["...", ...]}, ...}
        safe_prompts: описания нормального контента
        threshold: порог вероятности категории (0..1) для срабатывания
        """
        self.threshold = threshold
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        log.info("Загружаю модель %s (устройство: %s)...", MODEL_NAME, self.device)
        self.model = CLIPModel.from_pretrained(MODEL_NAME).to(self.device).eval()
        self.processor = CLIPProcessor.from_pretrained(MODEL_NAME)
        log.info("Модель загружена")

        # Плоский список промптов + к какой категории каждый относится
        self.prompts: list[str] = []
        self.prompt_category: list[str] = []
        self.labels: dict[str, str] = {}

        for key, cat in categories.items():
            self.labels[key] = cat.get("label", key)
            for p in cat["prompts"]:
                self.prompts.append(p)
                self.prompt_category.append(key)
        for p in safe_prompts:
            self.prompts.append(p)
            self.prompt_category.append("safe")

        # Текстовые эмбеддинги считаем один раз при старте
        with torch.no_grad():
            text_inputs = self.processor(
                text=self.prompts, return_tensors="pt", padding=True, truncation=True
            ).to(self.device)
            text_emb = self.model.get_text_features(**text_inputs)
            self.text_emb = text_emb / text_emb.norm(dim=-1, keepdim=True)

    # ------------------------------------------------------------------ public

    def classify(self, data: bytes) -> dict:
        """
        Возвращает вердикт:
        {"violation": bool, "category": str|None, "reason": str, "score": float}
        """
        frames = self._extract_frames(data)
        if not frames:
            return {"violation": False, "category": None, "reason": "не удалось прочитать файл", "score": 0.0}

        with torch.no_grad():
            image_inputs = self.processor(images=frames, return_tensors="pt").to(self.device)
            img_emb = self.model.get_image_features(**image_inputs)
            img_emb = img_emb / img_emb.norm(dim=-1, keepdim=True)

            # (кадры x промпты): косинусная близость * температура CLIP
            logits = img_emb @ self.text_emb.T * self.model.logit_scale.exp()
            probs = logits.softmax(dim=-1)  # softmax по промптам для каждого кадра

        # Для каждого кадра суммируем вероятности по категориям,
        # берём худший (максимальный) кадр по каждой категории.
        worst: dict[str, float] = {}
        best_prompt: dict[str, str] = {}
        for f in range(probs.shape[0]):
            cat_sum: dict[str, float] = {}
            for i, cat in enumerate(self.prompt_category):
                cat_sum[cat] = cat_sum.get(cat, 0.0) + probs[f, i].item()
            for cat, s in cat_sum.items():
                if s > worst.get(cat, 0.0):
                    worst[cat] = s
                    # самый вероятный промпт этой категории в этом кадре
                    idxs = [i for i, c in enumerate(self.prompt_category) if c == cat]
                    top = max(idxs, key=lambda i: probs[f, i].item())
                    best_prompt[cat] = self.prompts[top]

        # Самая вероятная запрещённая категория
        bad = {k: v for k, v in worst.items() if k != "safe"}
        top_cat = max(bad, key=bad.get)
        score = bad[top_cat]

        if score >= self.threshold and score > worst.get("safe", 0.0):
            return {
                "violation": True,
                "category": top_cat,
                "reason": (
                    f"{self.labels.get(top_cat, top_cat)} — похоже на «{best_prompt[top_cat]}» "
                    f"(уверенность {score:.0%})"
                ),
                "score": score,
            }
        return {"violation": False, "category": None, "reason": "нарушений не найдено", "score": score}

    # ----------------------------------------------------------------- helpers

    @staticmethod
    def _extract_frames(data: bytes) -> list[Image.Image]:
        try:
            img = Image.open(io.BytesIO(data))
        except Exception:
            return []

        frames: list[Image.Image] = []
        n = getattr(img, "n_frames", 1)
        if n > 1:
            # GIF/анимация: первый кадр, середина, последний
            indices = sorted({0, n // 2, n - 1})[:MAX_GIF_FRAMES]
            for i in indices:
                try:
                    img.seek(i)
                    frames.append(img.convert("RGB").copy())
                except Exception:
                    break
        else:
            frames.append(img.convert("RGB"))
        return frames
