from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 1) Register the real Flask Voice runtime used by Render.
run_path = ROOT / "run.py"
run = run_path.read_text(encoding="utf-8")
anchor = '''# ---------------- Optional Stage 4 admin/dev bypass routes ----------------\ntry:\n    from app.ai.admin_bypass import admin_bypass_bp\n    app.register_blueprint(admin_bypass_bp)\n    print("вњ… [MALIK] Admin/dev bypass routes connected: /api/ai/admin/status /api/ai/limits/status")\nexcept Exception as e:\n    print("вљ пёЏ [MALIK] Admin/dev bypass routes skipped:", e)\n'''
insert = anchor + '''\n# ---------------- Production Voice runtime (Flask / Render) ----------------\n# The deployed frontend is static and Flask owns /api/* in production.\n# Keep these endpoints in Flask so microphone/STT/TTS do not fall through to\n# browser speechSynthesis when Next server routes are unavailable.\ntry:\n    from app.ai.voice_runtime import voice_runtime_bp\n    app.register_blueprint(voice_runtime_bp)\n    print("✅ [MALIK] Voice runtime connected: /api/voice/tts /api/voice/turn /api/transcribe /api/voice/deepgram-token")\nexcept Exception as e:\n    print("⚠️ [MALIK] Voice runtime skipped:", e)\n'''
if "from app.ai.voice_runtime import voice_runtime_bp" not in run:
    if anchor not in run:
        raise SystemExit("run.py Voice registration anchor not found")
    run = run.replace(anchor, insert, 1)
    run_path.write_text(run, encoding="utf-8")

# 2) Install exact open-source Kazakh TTS runtime dependencies.
req_path = ROOT / "requirements.txt"
req = req_path.read_text(encoding="utf-8")
extra = '''\n# Malik Voice: local Kazakh Kokoro 82M (Apache-2.0)\n--extra-index-url https://download.pytorch.org/whl/cpu\ntorch==2.8.0+cpu\nkokoro==0.9.4\nmisaki==0.9.4\nespeakng-loader>=0.2.4\nphonemizer-fork>=3.3.1\nhuggingface-hub>=0.34.0\nnumpy>=1.26,<3\n'''
if "kokoro==0.9.4" not in req:
    req_path.write_text(req.rstrip() + "\n" + extra, encoding="utf-8")

# 3) Expose the model as a real Kazakh voice in the selector while preserving
# all 36 original Flux voices as explicitly English.
settings_path = ROOT / "app/templates/sovereign-hub-ui/components/voice/VoiceSettings.tsx"
settings = settings_path.read_text(encoding="utf-8")
voices_end = '''] as const\n\nexport const PERSONALITIES'''
kk_voice = '''  { name: "Kokoro M1", description: "Қазақша · native masculine · local Kokoro 82M", deepgramModel: "kokoro-kazakh-km_m1", rate: 1, pitch: 1, hints: maleHints },\n] as const\n\nexport const PERSONALITIES'''
if 'name: "Kokoro M1"' not in settings:
    if voices_end not in settings:
        raise SystemExit("VoiceSettings VOICES end anchor not found")
    settings = settings.replace(voices_end, kk_voice, 1)

settings = settings.replace(
    '<div className={styles.heading}><span>Голос</span><small>36 Deepgram Flux голосов · English</small></div>',
    '<div className={styles.heading}><span>Голос</span><small>36 Deepgram Flux · English + Kokoro · Қазақша</small></div>',
    1,
)
settings = settings.replace(
    '<span className={styles.itemText}><strong>{profile.name} <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">English</span></strong><small>{profile.description}</small></span>',
    '<span className={styles.itemText}><strong>{profile.name} <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{profile.deepgramModel.startsWith("kokoro-kazakh") ? "Қазақша" : "English"}</span></strong><small>{profile.description}</small></span>',
    1,
)
settings_path.write_text(settings, encoding="utf-8")

# 4) Preview the Kazakh voice in Kazakh, and show its actual name during kk replies.
mode_path = ROOT / "app/templates/sovereign-hub-ui/components/voice/VoiceMode.tsx"
mode = mode_path.read_text(encoding="utf-8")
old_preview = '''  const previewVoice = useCallback((profileName: string) => {\n    if (!soundEnabled) return\n    void speakReply(`Hello. I'm ${profileName}. How can I help you today?`, profileName)\n  }, [soundEnabled, speakReply])\n'''
new_preview = '''  const previewVoice = useCallback((profileName: string) => {\n    if (!soundEnabled) return\n    const sample = profileName === "Kokoro M1"\n      ? "Сәлем! Мен қазақша сөйлейтін Malik AI дауысымын."\n      : `Hello. I'm ${profileName}. How can I help you today?`\n    void speakReply(sample, profileName)\n  }, [soundEnabled, speakReply])\n'''
if old_preview in mode:
    mode = mode.replace(old_preview, new_preview, 1)
elif 'profileName === "Kokoro M1"' not in mode:
    raise SystemExit("VoiceMode preview anchor not found")

old_subtitle = '      setSubtitle(`${voice} · ${payload.language || detectVoiceLanguage(payload.content)}`)'
new_subtitle = '      setSubtitle(`${payload.language === "kk" ? "Kokoro M1" : voice} · ${payload.language || detectVoiceLanguage(payload.content)}`)'
if old_subtitle in mode:
    mode = mode.replace(old_subtitle, new_subtitle, 1)
elif 'payload.language === "kk" ? "Kokoro M1"' not in mode:
    raise SystemExit("VoiceMode reply subtitle anchor not found")
mode_path.write_text(mode, encoding="utf-8")

# 5) Update Voice regression expectations for the new native Kazakh voice.
test_path = ROOT / "app/templates/sovereign-hub-ui/scripts/verify-voice-mode.mjs"
test = test_path.read_text(encoding="utf-8")
test = test.replace(
    '["11 all 36 Flux voices replace legacy voice roster", () => { assert.match(settings, /36 Deepgram Flux голосов/); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.doesNotMatch(settings, /name: "Sola"/) }],',
    '["11 36 Flux English voices plus native Kazakh Kokoro voice", () => { assert.match(settings, /36 Deepgram Flux · English \+ Kokoro · Қазақша/); assert.match(settings, /name: "Kokoro M1"/); assert.match(settings, /kokoro-kazakh-km_m1/); for (const name of ["Cliff", "Kit", "Cole", "Colin", "Hannah", "Alexis", "Sienna", "Gemma", "Haley", "Wade", "Wes"]) assert.ok(settings.includes(`name: "${name}"`), `missing Flux voice ${name}`); assert.doesNotMatch(settings, /name: "Sola"/) }],',
    1,
)
test = test.replace(
    '["17 selected voice is honored: Flux EN, Gemini RU, multilingual KK fallback", () => { assert.match(mode, /language === "en"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /gemini-3\\.1-flash-tts-preview/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /language === "ru"/); assert.match(tts, /voiceId = "leo"/) }],',
    '["17 selected voice is honored and Kazakh UI points to Kokoro", () => { assert.match(mode, /language === "en"/); assert.match(tts, /deepgram-flux-batch/); assert.match(tts, /gemini-3\\.1-flash-tts-preview/); assert.match(tts, /GEMINI_VOICE_BY_PROFILE/); assert.match(tts, /language === "ru"/); assert.match(mode, /Kokoro M1/); assert.match(settings, /Қазақша/) }],',
    1,
)
test_path.write_text(test, encoding="utf-8")

print("Kokoro Kazakh Voice wired into Flask production runtime and Voice UI.")
