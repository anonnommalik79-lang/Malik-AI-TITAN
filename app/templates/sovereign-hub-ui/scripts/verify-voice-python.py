"""Dependency-free unit checks of production Python voice functions.

Compile the functions from the real module; replace HTTP/framework boundaries
only. This does not claim to test Flask deployment or real synthesized speech.
"""
import ast
import base64
import io
import json
import os
from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import Mock, patch
import wave
from datetime import datetime, timezone
from urllib.parse import quote

source = Path(__file__).resolve().parents[3] / "ai" / "voice_runtime.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
functions = {"_env", "_unique", "_speed", "_expressivity", "_language", "_wav_from_pcm16", "_gemini_audio_data", "_gemini_tts", "_elevenlabs_tts", "_should_search_voice", "_voice_search", "_matches_language", "_local_voice_fallback", "voice_turn", "voice_tts"}
constants = {"_KAZAKH_SPECIAL", "_KAZAKH_WORDS", "_RUSSIAN_CYRILLIC", "_GEMINI_VOICE_BY_PROFILE"}
nodes = []
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in functions:
        node.decorator_list = []
        nodes.append(node)
    elif isinstance(node, ast.Assign) and any(isinstance(item, ast.Name) and item.id in constants for item in node.targets):
        nodes.append(node)

class Reply:
    def __init__(self, body, mimetype="application/json"):
        self.body, self.mimetype, self.headers = body, mimetype, {}

http = Mock()
request = SimpleNamespace(method="POST", get_json=Mock())
namespace = {"Any": object, "os": os, "re": re, "quote": quote, "base64": base64, "io": io, "wave": wave, "json": json, "datetime": datetime, "timezone": timezone, "requests": http, "request": request, "Response": Reply, "jsonify": lambda body: Reply(body), "_PROVIDER_TIMEOUT": 1}
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), namespace)
checks = 0
def check(name, run):
    global checks
    run()
    checks += 1
    print("PASS " + name)

with patch.dict(os.environ, {}, clear=True):
    def intent():
        for text in ("Привет", "Не ищи в интернете", "Найди ошибку в коде", "Интернеттен іздеме"):
            assert not namespace["_should_search_voice"](text), text
        for text in ("Поищи в гугле", "Найди новости", "Search for news", "Интернеттен іздеп бер"):
            assert namespace["_should_search_voice"](text), text
    check("Python voice search intent", intent)

    def google():
        os.environ["SERPER_API_KEY"] = "test-only"
        os.environ["TAVILY_API_KEY"] = "test-only"
        http.post.reset_mock()
        http.post.return_value = SimpleNamespace(ok=True, json=lambda: {"organic": [{"title": "Source", "link": "https://example.com", "snippet": "A fact"}]})
        assert namespace["_voice_search"]("Поищи факт")[0]["provider"] == "serper"
        assert http.post.call_count == 1
    check("Python uses Google once without paid fan-out", google)

    def grounded():
        request.get_json.return_value = {"text": "Поищи факт", "language": "ru"}
        answer = Mock(return_value=("Вот проверенный факт.", "test", "test"))
        namespace["_voice_answer"] = answer
        response = namespace["voice_turn"]()
        assert response.body["usedWeb"] is True
        assert "A fact" in answer.call_args.args[3]
        assert "untrusted" in answer.call_args.args[3]
    check("Python voice reply is grounded in returned search results", grounded)

    def no_results():
        http.post.return_value = SimpleNamespace(ok=False, json=lambda: {})
        answer = Mock()
        namespace["_voice_answer"] = answer
        response = namespace["voice_turn"]()
        assert response.body["usedWeb"] is False
        assert "не удалось" in response.body["content"]
        answer.assert_not_called()
    check("Python never invents a successful search", no_results)

    def english_fallback():
        request.get_json.return_value = {"text": "Hello", "language": "en", "voice": "Cliff"}
        namespace["_deepgram_tts"] = Mock(return_value=None)
        gemini = Mock(return_value=(b"valid-test-audio", "audio/wav", "Charon"))
        namespace["_gemini_tts"] = gemini
        namespace["_xai_tts"] = Mock()
        response = namespace["voice_tts"]()
        assert response.mimetype == "audio/wav"
        assert response.headers["x-malik-tts-provider"] == "gemini"
        assert gemini.call_args.args[-1] == "en"
        namespace["_xai_tts"].assert_not_called()
    check("Python English TTS falls back while preserving English", english_fallback)

    def elevenlabs_languages():
        os.environ["ELEVENLABS_API_KEY"] = "test-only"
        fixture = b"ID3" + b"x" * 1024
        for language in ("ru", "kk"):
            http.post.reset_mock()
            http.post.return_value = SimpleNamespace(ok=True, content=fixture, headers={"content-type": "audio/mpeg"})
            request.get_json.return_value = {"text": "Сәлем" if language == "kk" else "Привет", "language": language}
            response = namespace["voice_tts"]()
            assert response.body == fixture
            assert response.headers["x-malik-tts-provider"] == "elevenlabs"
            assert response.headers["x-malik-tts-language"] == language
            sent = http.post.call_args.kwargs
            assert sent["json"]["model_id"] == "eleven_v3"
            assert sent["json"]["language_code"] == language
            assert sent["headers"]["xi-api-key"] == "test-only"
            assert http.post.call_count == 1
    check("Python real route calls ElevenLabs for RU and KK", elevenlabs_languages)

    def elevenlabs_failures():
        for ok, mime, content in ((False, "audio/mpeg", b"ID3" + b"x" * 200), (True, "application/json", b"x" * 200), (True, "audio/mpeg", b""), (True, "audio/mpeg", b"x" * 200)):
            http.post.return_value = SimpleNamespace(ok=ok, status_code=401, content=content, headers={"content-type": mime})
            assert namespace["_elevenlabs_tts"]("Привет", "Puck", "ru", 1, 0) is None
    check("Python rejects provider errors and invalid audio", elevenlabs_failures)

    def elevenlabs_preset():
        os.environ["ELEVENLABS_VOICE_ID_KOKORO_M1_CALM"] = "custom/calm"
        http.post.return_value = SimpleNamespace(ok=True, content=b"ID3" + b"x" * 1024, headers={"content-type": "audio/mpeg"})
        namespace["_elevenlabs_tts"]("Сәлем", "Kokoro M1 Calm", "kk", 1, 0)
        assert http.post.call_args.args[0].endswith("/custom%2Fcalm")
        assert http.post.call_args.kwargs["json"]["voice_settings"]["speed"] == .93
        assert http.post.call_args.kwargs["json"]["voice_settings"]["stability"] == 1
    check("Python selected voice and delivery settings reach provider", elevenlabs_preset)

print(f"Python Voice unit checks: {checks}/{checks} PASS (mock boundaries)")
