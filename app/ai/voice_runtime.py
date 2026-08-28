# -*- coding: utf-8 -*-
"""Production Voice API for the Flask/Render deployment.

The browser Voice UI is a static Next build on Render, so its /api/voice/*
requests must be implemented by Flask as well as by the Next development
server.  This blueprint mirrors the Voice API surface used by VoiceMode.

Kazakh TTS uses the open Apache-2.0 AnuarSv/kokoro-tts-kazakh checkpoint.
The checkpoint is downloaded lazily from Hugging Face on first Kazakh reply;
weights are never committed to this repository.
"""
from __future__ import annotations

import base64
import io
import os
import re
import threading
import time
import wave
from datetime import datetime, timezone
from typing import Any

import requests
from flask import Blueprint, Response, jsonify, request

voice_runtime_bp = Blueprint("voice_runtime", __name__)

_PROVIDER_TIMEOUT = max(3.0, float(os.environ.get("VOICE_PROVIDER_TIMEOUT_MS", "15000")) / 1000.0)
_KK_REPO = os.environ.get("KOKORO_KK_REPO", "AnuarSv/kokoro-tts-kazakh").strip()
_KK_CACHE = os.environ.get("KOKORO_KK_CACHE_DIR", "/tmp/malik-kokoro-kazakh").strip()
_KK_ENABLED = os.environ.get("KOKORO_KK_ENABLED", "1").strip() != "0"
_KK_SAMPLE_RATE = 24000

_KK_MODEL = None
_KK_VOICEPACK = None
_KK_G2P = None
_KK_LOCK = threading.RLock()

_USAGE_LOCK = threading.Lock()
_USAGE: dict[tuple[str, str], float] = {}

_KAZAKH_SPECIAL = re.compile(r"[әіңғүұқөһ]", re.I)
_RUSSIAN_CYRILLIC = re.compile(r"[а-яё]", re.I)
_KAZAKH_WORDS = re.compile(
    r"\b(сәлем|салем|қалай|калай|жақсы|жаксы|қазақ|казак|қазақстан|казахстан|"
    r"рахмет|рақмет|керек|болады|болмайды|иә|ия|жоқ|жок|менің|сенің|біздің|"
    r"сіздің|қайда|кайда|қанша|канша|неге|осы|бұл|бул)\b",
    re.I,
)

_DEEPGRAM_VOICES = {
    "hannah", "kit", "alexis", "cliff", "sienna", "cole", "brooke", "colin", "gemma", "haley", "heather", "miles", "sean",
    "bree", "brittany", "bruce", "conor", "donovan", "drew", "elise", "jack", "kai", "kelsey", "maeve", "marcelo", "marcus",
    "meena", "meghan", "naveen", "paige", "priya", "rufus", "sharon", "tanner", "wade", "wes",
}

_GEMINI_VOICE_BY_PROFILE = {
    "cliff": "Charon", "kit": "Puck", "cole": "Iapetus", "colin": "Rasalgethi",
    "miles": "Schedar", "sean": "Gacrux", "bruce": "Orus", "conor": "Algenib",
    "donovan": "Sadaltager", "drew": "Achird", "jack": "Alnilam", "kai": "Zubenelgenubi",
    "marcelo": "Laomedeia", "marcus": "Algieba", "naveen": "Enceladus", "rufus": "Fenrir",
    "tanner": "Iapetus", "wade": "Orus", "wes": "Charon", "hannah": "Kore", "alexis": "Autonoe",
    "sienna": "Vindemiatrix", "brooke": "Sadachbia", "gemma": "Aoede", "haley": "Achernar",
    "heather": "Zephyr", "bree": "Leda", "brittany": "Callirrhoe", "elise": "Erinome",
    "kelsey": "Despina", "maeve": "Pulcherrima", "meena": "Sulafat", "meghan": "Laomedeia",
    "paige": "Umbriel", "priya": "Autonoe", "sharon": "Vindemiatrix",
    "charon": "Charon", "puck": "Puck", "kore": "Kore", "aoede": "Aoede", "fenrir": "Fenrir",
}

_PERSONALITY = {
    "Assistant": "Be a natural, concise voice assistant. Use short spoken sentences and no markdown unless necessary.",
    "Therapist": "Use a calm reflective conversational style. Listen carefully, ask useful gentle questions, and avoid diagnosing.",
    "Storyteller": "Answer like a vivid storyteller with natural pacing while staying concise enough for speech.",
    "Kids Story Time": "Use a friendly age-appropriate storytelling voice. Keep content safe, simple and warm.",
    "Kids Trivia Game": "Run a friendly spoken trivia game. Ask one clear question at a time.",
    "Meditation": "Use very calm, brief sentences suitable for spoken meditation.",
    "Motivation": "Use an energetic, practical coaching style without hype or pressure.",
    "Romantic": "Use a warm, gentle, emotionally expressive conversational style while respecting boundaries.",
    "Argumentative": "Challenge claims constructively and stay respectful and evidence-oriented.",
}


def _env(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _language(text: str) -> str:
    normalized = text.lower()
    if _KAZAKH_SPECIAL.search(text) or _KAZAKH_WORDS.search(normalized):
        return "kk"
    if _RUSSIAN_CYRILLIC.search(text):
        return "ru"
    return "en"


def _speed(value: Any) -> float:
    try:
        raw = float(value)
    except (TypeError, ValueError):
        raw = 1.0
    return min(1.15, max(0.85, raw))


def _expressivity(value: Any) -> int:
    try:
        raw = int(round(float(value)))
    except (TypeError, ValueError):
        raw = 0
    return min(2, max(-2, raw))


def _wav_from_float(audio: Any, sample_rate: int = _KK_SAMPLE_RATE) -> bytes:
    import numpy as np

    values = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
    values = np.asarray(values, dtype=np.float32).reshape(-1)
    values = np.clip(values, -1.0, 1.0)
    pcm = (values * 32767.0).astype("<i2").tobytes()
    target = io.BytesIO()
    with wave.open(target, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return target.getvalue()


def _wav_from_pcm16(pcm: bytes, sample_rate: int = 24000) -> bytes:
    target = io.BytesIO()
    with wave.open(target, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return target.getvalue()


def _split_kazakh(text: str, max_chars: int = 220) -> list[str]:
    sentences = re.split(r"(?<=[.!?…])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
            current = ""
        words = sentence.split()
        part = ""
        for word in words:
            candidate = f"{part} {word}".strip() if part else word
            if len(candidate) > max_chars and part:
                chunks.append(part)
                part = word
            else:
                part = candidate
        current = part
    if current:
        chunks.append(current)
    return chunks or [text.strip()]


def _load_kokoro_kazakh():
    global _KK_MODEL, _KK_VOICEPACK, _KK_G2P
    if _KK_MODEL is not None and _KK_VOICEPACK is not None and _KK_G2P is not None:
        return _KK_MODEL, _KK_VOICEPACK, _KK_G2P
    if not _KK_ENABLED:
        raise RuntimeError("Kokoro Kazakh is disabled")

    with _KK_LOCK:
        if _KK_MODEL is not None and _KK_VOICEPACK is not None and _KK_G2P is not None:
            return _KK_MODEL, _KK_VOICEPACK, _KK_G2P

        import torch
        from huggingface_hub import hf_hub_download
        from kokoro import KModel
        from misaki import espeak

        os.makedirs(_KK_CACHE, exist_ok=True)
        model_path = hf_hub_download(repo_id=_KK_REPO, filename="kokoro_kazakh.pth", local_dir=_KK_CACHE)
        voice_path = hf_hub_download(repo_id=_KK_REPO, filename="km_m1.pt", local_dir=_KK_CACHE)
        config_path = hf_hub_download(repo_id=_KK_REPO, filename="config.json", local_dir=_KK_CACHE)

        try:
            torch.set_num_threads(max(1, int(os.environ.get("KOKORO_KK_CPU_THREADS", "2"))))
        except Exception:
            pass

        _KK_MODEL = KModel(
            repo_id="hexgrad/Kokoro-82M",
            config=config_path,
            model=model_path,
        ).eval()
        _KK_VOICEPACK = torch.load(voice_path, map_location="cpu", weights_only=True)
        _KK_G2P = espeak.EspeakG2P(language="kk")
        return _KK_MODEL, _KK_VOICEPACK, _KK_G2P


def synthesize_kazakh(text: str, speed: float = 1.0) -> bytes:
    """Generate exact Kokoro Kazakh km_m1 audio and return a PCM WAV."""
    import numpy as np
    import torch

    model, voicepack, g2p = _load_kokoro_kazakh()
    pieces: list[Any] = []
    silence = torch.zeros(int(_KK_SAMPLE_RATE * 0.11), dtype=torch.float32)

    with _KK_LOCK, torch.inference_mode():
        for index, chunk in enumerate(_split_kazakh(text)):
            phonemes, _ = g2p(chunk)
            if not phonemes:
                continue
            ref_s = voicepack[min(len(phonemes) - 1, voicepack.shape[0] - 1)]
            audio = model(phonemes, ref_s, speed=speed)
            if hasattr(audio, "audio"):
                audio = audio.audio
            if index and pieces:
                pieces.append(silence)
            pieces.append(audio.detach().cpu().float())

    if not pieces:
        raise RuntimeError("Kokoro Kazakh produced no audio")
    merged = torch.cat(pieces)
    if not np.isfinite(merged.numpy()).all():
        raise RuntimeError("Kokoro Kazakh produced invalid audio")
    return _wav_from_float(merged)


def _deepgram_tts(text: str, voice: str, speed: float, expressivity: int):
    keys = _unique([_env("DEEPGRAM_VOICE_API_KEY"), _env("DEEPGRAM_API_KEY")])
    if not keys:
        return None
    slug = re.sub(r"[^a-z0-9-]", "", (voice or "Cliff").strip().lower())
    if slug not in _DEEPGRAM_VOICES:
        slug = "cliff"
    model = f"flux-{slug}-en"
    params = {"model": model, "encoding": "mp3", "speed": str(speed), "expressivity": str(expressivity)}
    for key in keys:
        try:
            response = requests.post(
                "https://api.deepgram.com/v2/speak",
                params=params,
                headers={"Authorization": f"Token {key}", "Content-Type": "application/json", "Accept": "audio/mpeg"},
                json={"text": text},
                timeout=_PROVIDER_TIMEOUT,
            )
            if response.ok and len(response.content) > 128:
                return response.content, response.headers.get("content-type", "audio/mpeg"), model
        except Exception as exc:
            print("[VOICE_DEEPGRAM_TTS_ERROR]", exc)
    return None


def _gemini_audio_data(payload: Any) -> str:
    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list) or not candidates:
        return ""
    parts = ((candidates[0] or {}).get("content") or {}).get("parts") or []
    for part in parts:
        inline = (part or {}).get("inlineData") or (part or {}).get("inline_data") or {}
        data = inline.get("data")
        if isinstance(data, str) and data:
            return data
    return ""


def _gemini_tts(text: str, voice: str, speed: float, expressivity: int):
    keys = _unique([
        _env("GEMINI_VOICE_API_KEY"), _env("GEMINI_API_KEY"),
        _env("GOOGLE_GENERATIVE_AI_API_KEY"), _env("GOOGLE_AI_API_KEY"),
    ])
    if not keys:
        return None
    model = _env("GEMINI_TTS_MODEL") or "gemini-3.1-flash-tts-preview"
    mapped = _GEMINI_VOICE_BY_PROFILE.get((voice or "Cliff").strip().lower(), "Charon")
    pace = "slightly slower than normal" if speed <= 0.9 else "slightly faster than normal" if speed >= 1.1 else "natural conversational speed"
    emotion = "restrained and calm" if expressivity <= -1 else "expressive and lively" if expressivity >= 1 else "natural and warm"
    prompt = f"Speak in Russian. Use a {emotion} delivery at {pace}. Do not translate, summarize, explain, or add any words. Read only the text after TEXT.\nTEXT:\n{text}"
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "languageCode": "ru-RU",
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": mapped}},
            },
        },
    }
    for key in keys:
        try:
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": key, "content-type": "application/json"},
                json=body,
                timeout=max(_PROVIDER_TIMEOUT, 30),
            )
            payload = response.json() if response.content else {}
            if not response.ok:
                print("[VOICE_GEMINI_TTS_ERROR]", response.status_code, str((payload.get("error") or {}).get("message", ""))[:220])
                continue
            encoded = _gemini_audio_data(payload)
            if encoded:
                pcm = base64.b64decode(encoded)
                if len(pcm) > 128:
                    return _wav_from_pcm16(pcm), "audio/wav", f"{voice}:{mapped}"
        except Exception as exc:
            print("[VOICE_GEMINI_TTS_ERROR]", exc)
    return None


def _xai_tts(text: str, language: str, speed: float):
    keys = _unique([_env("XAI_VOICE_API_KEY"), _env("XAI_API_KEY")])
    if not keys:
        return None
    tts_language = "ru" if language == "ru" else "en" if language == "en" else "auto"
    for key in keys:
        try:
            response = requests.post(
                "https://api.x.ai/v1/tts",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "audio/mpeg"},
                json={
                    "text": text,
                    "voice_id": "leo",
                    "language": tts_language,
                    "output_format": {"codec": "mp3", "sample_rate": 44100, "bit_rate": 192000},
                    "speed": speed,
                    "text_normalization": True,
                    "optimize_streaming_latency": 0,
                },
                timeout=_PROVIDER_TIMEOUT,
            )
            if response.ok and len(response.content) > 128:
                return response.content, response.headers.get("content-type", "audio/mpeg"), "leo"
        except Exception as exc:
            print("[VOICE_XAI_TTS_ERROR]", exc)
    return None


def _client_id() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return request.headers.get("X-Malik-User-Id", "").strip() or forwarded or request.remote_addr or "guest"


def _quota_key() -> tuple[str, str]:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d"), _client_id()


def _quota_remaining() -> float:
    limit = max(1.0, float(os.environ.get("VOICE_DAILY_LIMIT_SECONDS", "120")))
    with _USAGE_LOCK:
        used = _USAGE.get(_quota_key(), 0.0)
    return max(0.0, limit - used)


def _consume_quota(seconds: float) -> float:
    limit = max(1.0, float(os.environ.get("VOICE_DAILY_LIMIT_SECONDS", "120")))
    with _USAGE_LOCK:
        key = _quota_key()
        _USAGE[key] = min(limit, _USAGE.get(key, 0.0) + max(1.0, seconds))
        return max(0.0, limit - _USAGE[key])


def _groq_transcribe(audio: bytes, filename: str, mime: str, language: str = "auto"):
    keys = _unique([_env("GROQ_VOICE_API_KEY"), _env("GROQ_API_KEY")])
    models = _unique([_env("GROQ_WHISPER_PRIMARY") or "whisper-large-v3-turbo", _env("GROQ_WHISPER_FALLBACK") or "whisper-large-v3"])
    for model in models:
        for key in keys:
            try:
                response = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {key}"},
                    files={"file": (filename, audio, mime or "application/octet-stream")},
                    data={"model": model, "response_format": "verbose_json", **({"language": language} if language in {"kk", "ru", "en"} else {})},
                    timeout=max(_PROVIDER_TIMEOUT, 30),
                )
                payload = response.json() if response.content else {}
                text = str(payload.get("text") or "").strip()
                if response.ok and text:
                    return text, payload.get("language"), payload.get("duration"), "groq", model
                print("[VOICE_STT_GROQ_ERROR]", response.status_code, str((payload.get("error") or {}).get("message", ""))[:220])
            except Exception as exc:
                print("[VOICE_STT_GROQ_ERROR]", exc)
    return None


def _cloudflare_transcribe(audio: bytes, language: str = "auto"):
    token = _env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN")
    account = _env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID")
    if not token or not account:
        return None
    models = _unique([_env("CLOUDFLARE_WHISPER_PRIMARY") or "@cf/openai/whisper-large-v3-turbo", _env("CLOUDFLARE_WHISPER_FALLBACK") or "@cf/openai/whisper"])
    for model in models:
        try:
            response = requests.post(
                f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"audio": base64.b64encode(audio).decode("ascii"), "task": "transcribe", "vad_filter": True, **({"language": language} if language in {"kk", "ru", "en"} else {})},
                timeout=max(_PROVIDER_TIMEOUT, 30),
            )
            payload = response.json() if response.content else {}
            result = payload.get("result") or payload
            text = str((result or {}).get("text") or (result or {}).get("transcription") or "").strip()
            if response.ok and payload.get("success", True) is not False and text:
                return text, (result or {}).get("language"), (result or {}).get("duration"), "cloudflare", model
            print("[VOICE_STT_CF_ERROR]", response.status_code, str(payload.get("errors") or payload.get("error") or "")[:220])
        except Exception as exc:
            print("[VOICE_STT_CF_ERROR]", exc)
    return None


def _language_instruction(language: str) -> str:
    if language == "kk":
        return "LANGUAGE LOCK: KAZAKH ONLY. Respond ONLY in natural modern Kazakh using Cyrillic Kazakh spelling. Never answer in English or Russian. Do not mix Russian or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
    if language == "ru":
        return "LANGUAGE LOCK: RUSSIAN ONLY. Respond ONLY in natural Russian. Never answer in English or Kazakh. Do not mix Kazakh or English except exact brands, code, URLs or proper names. Keep sentences pronunciation-friendly for TTS."
    return "LANGUAGE LOCK: ENGLISH ONLY. Respond ONLY in natural English. Never answer in Russian or Kazakh except exact proper names. Keep sentences pronunciation-friendly for TTS."


def _voice_answer(text: str, personality: str, language: str):
    system = " ".join([
        "You are Sola, the Malik AI voice assistant.",
        _PERSONALITY.get(personality, _PERSONALITY["Assistant"]),
        _language_instruction(language),
        "Preserve the user's intended language even if transcription contains one or two foreign-looking tokens.",
        "Never output mixed-script gibberish or half-transliterated words.",
        "Never mention internal providers, routing, environment variables, or API keys.",
    ])
    max_tokens = max(80, int(os.environ.get("VOICE_LLM_MAX_OUTPUT_TOKENS", "700")))
    temperature = float(os.environ.get("VOICE_LLM_TEMPERATURE", "0.45"))

    groq_keys = _unique([_env("GROQ_VOICE_API_KEY"), _env("GROQ_API_KEY")])
    groq_model = _env("GROQ_VOICE_LLM_MODEL", "VOICE_LLM_GROQ_MODEL") or "openai/gpt-oss-20b"
    for key in groq_keys:
        try:
            response = requests.post(
                f"{(_env('GROQ_BASE_URL') or 'https://api.groq.com/openai/v1').rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": groq_model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": text}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": False,
                },
                timeout=_PROVIDER_TIMEOUT,
            )
            payload = response.json() if response.content else {}
            content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "") if isinstance(payload, dict) else ""
            if response.ok and str(content).strip():
                return str(content).strip(), "groq", groq_model
            print("[VOICE_LLM_GROQ_ERROR]", response.status_code)
        except Exception as exc:
            print("[VOICE_LLM_GROQ_ERROR]", exc)

    token = _env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN")
    account = _env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID")
    cf_model = _env("CLOUDFLARE_VOICE_LLM_MODEL", "VOICE_LLM_CLOUDFLARE_MODEL") or "@cf/meta/llama-3.1-8b-instruct-fast"
    if token and account:
        try:
            response = requests.post(
                f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={
                    "model": cf_model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": text}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": False,
                },
                timeout=_PROVIDER_TIMEOUT,
            )
            payload = response.json() if response.content else {}
            content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "") if isinstance(payload, dict) else ""
            if response.ok and str(content).strip():
                return str(content).strip(), "cloudflare", cf_model
        except Exception as exc:
            print("[VOICE_LLM_CF_ERROR]", exc)
    return None


def _matches_language(text: str, language: str) -> bool:
    if language == "kk":
        return bool(_KAZAKH_SPECIAL.search(text) or re.search(r"\b(мен|сен|сіз|бұл|осы|және|үшін|қалай|жақсы|керек|бар|жоқ|иә|рақмет|сәлем|қазақ|қазір|болады)\b", text, re.I))
    if language == "ru":
        return bool(_RUSSIAN_CYRILLIC.search(text) and not _KAZAKH_SPECIAL.search(text))
    return bool(re.search(r"[a-z]", text, re.I) and not re.search(r"[а-яёәіңғүұқөһ]", text, re.I))


def _local_voice_fallback(language: str) -> str:
    if language == "kk":
        return "Қазір жауап алу сәтсіз болды. Бір секундтан кейін қайта айтып көр."
    if language == "ru":
        return "Сейчас не получилось получить ответ. Попробуй сказать ещё раз через секунду."
    return "I couldn't get a response just now. Try saying it again in a second."


@voice_runtime_bp.route("/api/voice/deepgram-token", methods=["GET", "OPTIONS"])
def deepgram_token():
    if request.method == "OPTIONS":
        return "", 204
    keys = _unique([_env("DEEPGRAM_VOICE_API_KEY"), _env("DEEPGRAM_API_KEY")])
    for key in keys:
        try:
            response = requests.post(
                "https://api.deepgram.com/v1/auth/grant",
                headers={"Authorization": f"Token {key}", "Content-Type": "application/json"},
                json={"ttl_seconds": 120},
                timeout=_PROVIDER_TIMEOUT,
            )
            payload = response.json() if response.content else {}
            token = payload.get("access_token") or payload.get("accessToken")
            if response.ok and token:
                result = jsonify({"ok": True, "accessToken": token})
                result.headers["Cache-Control"] = "no-store, private"
                return result
        except Exception as exc:
            print("[VOICE_DEEPGRAM_TOKEN_ERROR]", exc)
    return jsonify({"ok": False, "error": "Deepgram Voice token unavailable"}), 503


@voice_runtime_bp.route("/api/voice/tts", methods=["POST", "OPTIONS"])
def voice_tts():
    if request.method == "OPTIONS":
        return "", 204
    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or "").strip()[:3500]
    voice = str(body.get("voice") or "Cliff").strip()
    if not text:
        return jsonify({"ok": False, "error": "Пустой текст"}), 400
    requested_language = str(body.get("language") or "").strip().lower()
    language = requested_language if requested_language in {"kk", "ru", "en"} else _language(text)
    speed = _speed(body.get("speed"))
    expressivity = _expressivity(body.get("expressivity"))

    if language == "kk":
        try:
            started = time.time()
            kazakh_speed = speed
            if voice == "Kokoro M1 Calm":
                kazakh_speed = max(.85, min(1.15, speed * .93))
            elif voice == "Kokoro M1 Strong":
                kazakh_speed = max(.85, min(1.15, speed * 1.05))
            audio = synthesize_kazakh(text, kazakh_speed)
            print("[VOICE_KOKORO_KK_OK]", {"bytes": len(audio), "latencyMs": int((time.time() - started) * 1000)})
            response = Response(audio, mimetype="audio/wav")
            response.headers["Cache-Control"] = "no-store"
            response.headers["x-malik-tts-provider"] = "kokoro-kazakh"
            response.headers["x-malik-tts-engine"] = _KK_REPO
            response.headers["x-malik-tts-voice"] = voice if voice.startswith("Kokoro M1") else "Kokoro M1"
            return response
        except Exception as exc:
            print("[VOICE_KOKORO_KK_ERROR]", repr(exc))
            return jsonify({"ok": False, "language": language, "error": "Kazakh Kokoro TTS unavailable; wrong-language fallback blocked"}), 503

    if language == "en":
        generated = _deepgram_tts(text, voice, speed, expressivity)
        provider = "deepgram"
    else:
        generated = _gemini_tts(text, voice, speed, expressivity)
        provider = "gemini"
        if not generated:
            generated = _xai_tts(text, language, speed)
            provider = "xai"

    if generated:
        audio, mime, used_voice = generated
        response = Response(audio, mimetype=mime)
        response.headers["Cache-Control"] = "no-store"
        response.headers["x-malik-tts-provider"] = provider
        response.headers["x-malik-tts-voice"] = used_voice
        return response

    return jsonify({"ok": False, "fallback": "browser-language-aware", "language": language, "error": "Voice TTS unavailable"}), 503


@voice_runtime_bp.route("/api/transcribe", methods=["GET", "POST", "OPTIONS"])
def transcribe():
    if request.method == "OPTIONS":
        return "", 204
    if request.method == "GET":
        configured = bool(_env("GROQ_VOICE_API_KEY", "GROQ_API_KEY") or (_env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN") and _env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")))
        return jsonify({"ok": True, "configured": configured, "quota": {"remainingSeconds": _quota_remaining()}})

    if _quota_remaining() <= 0:
        return jsonify({"ok": False, "error": "Лимит Voice на сегодня использован. Доступ восстановится завтра.", "remainingSeconds": 0}), 429
    uploaded = request.files.get("file")
    if uploaded is None:
        return jsonify({"ok": False, "error": "файл не передан"}), 400
    audio = uploaded.read()
    if not audio:
        return jsonify({"ok": False, "error": "пустой аудиофайл"}), 400
    if len(audio) > 25 * 1024 * 1024:
        return jsonify({"ok": False, "error": "файл больше 25 МБ"}), 413
    try:
        duration = max(1.0, float(request.form.get("durationSec") or 0.0))
    except ValueError:
        duration = 1.0
    if duration > _quota_remaining() + 0.5:
        return jsonify({"ok": False, "error": f"Осталось {int(_quota_remaining())} сек. Voice на сегодня."}), 429

    requested_language = str(request.form.get("language") or "auto").strip().lower()
    if requested_language not in {"kk", "ru", "en"}:
        requested_language = "auto"
    result = _groq_transcribe(audio, uploaded.filename or "malik-voice.webm", uploaded.mimetype or "audio/webm", requested_language)
    if not result:
        result = _cloudflare_transcribe(audio, requested_language)
    if not result:
        return jsonify({"ok": False, "error": "Не удалось распознать голос. Попробуйте ещё раз."}), 502

    text, language, measured, provider, model = result
    remaining = _consume_quota(duration if duration > 0 else float(measured or 1.0))
    return jsonify({
        "ok": True,
        "text": text,
        "language": language,
        "durationSec": duration,
        "remainingSeconds": remaining,
        "provider": provider,
        "model": model,
    })


@voice_runtime_bp.route("/api/voice/turn", methods=["POST", "OPTIONS"])
def voice_turn():
    if request.method == "OPTIONS":
        return "", 204
    body = request.get_json(silent=True) or {}
    text = str(body.get("text") or body.get("message") or "").strip()[:6000]
    personality = str(body.get("personality") or "Assistant")
    if not text:
        return jsonify({"ok": False, "error": "Пустой Voice запрос"}), 400
    requested_language = str(body.get("language") or "").strip().lower()
    language = requested_language if requested_language in {"kk", "ru", "en"} else _language(text)
    answer = _voice_answer(text, personality, language)
    if answer:
        content, provider, model = answer
        if not _matches_language(content, language):
            retry = _voice_answer(f"Answer this user request again. Obey the selected language lock exactly. USER REQUEST:\n{text}", personality, language)
            if retry and _matches_language(retry[0], language):
                content, provider, model = retry
            else:
                content, provider, model = _local_voice_fallback(language), "voice-local-fallback", "none"
    else:
        content, provider, model = _local_voice_fallback(language), "voice-local-fallback", "none"
    response = jsonify({
        "ok": True,
        "content": content,
        "personality": personality,
        "language": language,
        "provider": provider,
        "model": model,
    })
    response.headers["Cache-Control"] = "no-store"
    return response


@voice_runtime_bp.route("/api/voice/health", methods=["GET"])
def voice_health():
    return jsonify({
        "ok": True,
        "runtime": "flask-render",
        "kokoroKazakh": {"enabled": _KK_ENABLED, "repo": _KK_REPO, "loaded": _KK_MODEL is not None, "voice": "km_m1"},
        "deepgram": bool(_env("DEEPGRAM_VOICE_API_KEY", "DEEPGRAM_API_KEY")),
        "gemini": bool(_env("GEMINI_VOICE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY")),
        "groqStt": bool(_env("GROQ_VOICE_API_KEY", "GROQ_API_KEY")),
        "cloudflareStt": bool(_env("CLOUDFLARE_VOICE_API_TOKEN", "CLOUDFLARE_API_TOKEN") and _env("CLOUDFLARE_VOICE_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")),
    })
