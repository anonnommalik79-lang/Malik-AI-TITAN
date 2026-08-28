# -*- coding: utf-8 -*-
"""Production Malik Translator runtime for the Flask/Render deployment."""
from __future__ import annotations

import html
import os
import re
from typing import Any

import requests
from flask import Blueprint, jsonify, request

translator_runtime_bp = Blueprint("translator_runtime", __name__)

SUPPORTED = {
    "auto", "ru", "en", "kk", "tr", "de", "fr", "es", "it", "pt", "uk", "pl", "nl", "ar", "zh-CN", "ja", "ko", "hi",
}
LANGUAGE_NAMES = {
    "ru": "Russian", "en": "English", "kk": "Kazakh", "tr": "Turkish", "de": "German",
    "fr": "French", "es": "Spanish", "it": "Italian", "pt": "Portuguese", "uk": "Ukrainian",
    "pl": "Polish", "nl": "Dutch", "ar": "Arabic", "zh-CN": "Simplified Chinese",
    "ja": "Japanese", "ko": "Korean", "hi": "Hindi",
}
MAX_TEXT_LENGTH = 5000
MAX_SEGMENT_BYTES = 450


def _env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _detect_language(text: str) -> str:
    if re.search(r"[ӘәҒғҚқҢңӨөҰұҮүҺһ]", text):
        return "kk"
    if re.search(r"[ぁ-ゟ゠-ヿ]", text):
        return "ja"
    if re.search(r"[가-힣]", text):
        return "ko"
    if re.search(r"[一-鿿]", text):
        return "zh-CN"
    if re.search(r"[؀-ۿ]", text):
        return "ar"
    if re.search(r"[А-Яа-яЁёІіЇїЄєҐґ]", text):
        if re.search(r"[ІіЇїЄєҐґ]", text):
            return "uk"
        return "ru"
    if re.search(r"[ĞğİıŞşÇçÖöÜü]", text):
        return "tr"
    return "en"


def _gemini_text(payload: Any) -> str:
    try:
        parts = payload.get("candidates", [])[0].get("content", {}).get("parts", [])
        return "".join(str(part.get("text") or "") for part in parts).strip()
    except Exception:
        return ""


def _translate_gemini(text: str, source: str, target: str) -> str:
    key = _env("GEMINI_TRANSLATOR_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY")
    if not key:
        return ""
    model = _env("GEMINI_TRANSLATOR_MODEL", "MALIK_GEMINI_MODEL") or "gemini-3.7-flash"
    source_name = LANGUAGE_NAMES.get(source, source)
    target_name = LANGUAGE_NAMES.get(target, target)
    prompt = "\n".join([
        "You are Malik Translator.",
        f"Translate the following text from {source_name} to {target_name}.",
        "Return ONLY the translated text.",
        "Preserve paragraph breaks, punctuation, numbers, URLs, product names, code identifiers and proper names when appropriate.",
        "Do not explain the translation and do not add quotation marks or notes.",
        "TEXT:",
        text,
    ])
    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key, "content-type": "application/json"},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.05, "maxOutputTokens": 4096},
            },
            timeout=15,
        )
        if not response.ok:
            return ""
        return _gemini_text(response.json())
    except Exception as exc:
        print("[TRANSLATOR_GEMINI_ERROR]", exc)
        return ""


def _split_by_bytes(value: str, max_bytes: int = MAX_SEGMENT_BYTES) -> list[str]:
    if len(value.encode("utf-8")) <= max_bytes:
        return [value]
    chunks: list[str] = []
    current = ""
    for token in re.split(r"(\s+)", value):
        if not token:
            continue
        candidate = current + token
        if len(candidate.encode("utf-8")) <= max_bytes:
            current = candidate
            continue
        if current.strip():
            chunks.append(current.strip())
            current = ""
        if len(token.encode("utf-8")) <= max_bytes:
            current = token
            continue
        hard = ""
        for char in token:
            candidate = hard + char
            if len(candidate.encode("utf-8")) > max_bytes and hard:
                chunks.append(hard)
                hard = char
            else:
                hard = candidate
        current = hard
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _translate_classic(text: str, source: str, target: str) -> str:
    output: list[str] = []
    for block in re.split(r"(\n+)", text):
        if not block:
            continue
        if re.fullmatch(r"\n+", block):
            output.append(block)
            continue
        translated_chunks: list[str] = []
        for chunk in _split_by_bytes(block):
            params = {"q": chunk, "langpair": f"{source}|{target}", "mt": "1"}
            response = requests.get("https://api.mymemory.translated.net/get", params=params, headers={"Accept": "application/json"}, timeout=9)
            response.raise_for_status()
            payload = response.json()
            translated = str((payload.get("responseData") or {}).get("translatedText") or "").strip()
            if not translated:
                raise RuntimeError("translation_empty")
            translated_chunks.append(html.unescape(translated))
        output.append(" ".join(translated_chunks))
    return "".join(output).strip()


@translator_runtime_bp.route("/api/translator", methods=["POST", "OPTIONS"])
def translate():
    if request.method == "OPTIONS":
        return "", 204
    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or "").strip()
    requested_source = str(body.get("source") or "auto")
    target = str(body.get("target") or "en")

    if not text:
        return jsonify({"error": "Введите текст для перевода."}), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({"error": f"Максимум {MAX_TEXT_LENGTH} символов за один перевод."}), 400
    if requested_source not in SUPPORTED or target not in SUPPORTED or target == "auto":
        return jsonify({"error": "Неподдерживаемая языковая пара."}), 400

    source = _detect_language(text) if requested_source == "auto" else requested_source
    if source == target:
        return jsonify({"translatedText": text, "detectedSource": source, "provider": "malik-translator"})

    translated = _translate_gemini(text, source, target)
    if not translated:
        try:
            translated = _translate_classic(text, source, target)
        except Exception as exc:
            print("[TRANSLATOR_CLASSIC_ERROR]", exc)
            return jsonify({"error": "Сервис перевода временно не ответил. Повторите через несколько секунд."}), 502

    response = jsonify({"translatedText": translated, "detectedSource": source, "provider": "malik-translator"})
    response.headers["Cache-Control"] = "no-store"
    return response
