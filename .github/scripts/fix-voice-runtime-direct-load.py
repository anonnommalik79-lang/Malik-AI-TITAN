from pathlib import Path

path = Path("run.py")
text = path.read_text(encoding="utf-8")
old = '''try:\n    from app.ai.voice_runtime import voice_runtime_bp\n    app.register_blueprint(voice_runtime_bp)\n    print("✅ [MALIK] Voice runtime connected: /api/voice/tts /api/voice/turn /api/transcribe /api/voice/deepgram-token")\nexcept Exception as e:\n    print("⚠️ [MALIK] Voice runtime skipped:", e)\n'''
new = '''try:\n    import importlib.util as _voice_importlib_util\n    from pathlib import Path as _VoicePath\n    _voice_runtime_path = _VoicePath(__file__).resolve().parent / "app" / "ai" / "voice_runtime.py"\n    _voice_runtime_spec = _voice_importlib_util.spec_from_file_location("malik_voice_runtime", _voice_runtime_path)\n    if _voice_runtime_spec is None or _voice_runtime_spec.loader is None:\n        raise RuntimeError("Voice runtime module loader unavailable")\n    _voice_runtime_module = _voice_importlib_util.module_from_spec(_voice_runtime_spec)\n    _voice_runtime_spec.loader.exec_module(_voice_runtime_module)\n    app.register_blueprint(_voice_runtime_module.voice_runtime_bp)\n    print("✅ [MALIK] Voice runtime connected: /api/voice/tts /api/voice/turn /api/transcribe /api/voice/deepgram-token")\nexcept Exception as e:\n    print("⚠️ [MALIK] Voice runtime skipped:", e)\n'''
if old in text:
    text = text.replace(old, new, 1)
elif 'spec_from_file_location("malik_voice_runtime"' not in text:
    raise SystemExit("Direct Voice runtime registration anchor not found")
path.write_text(text, encoding="utf-8")
print("Voice runtime isolated from legacy app package initialization.")
