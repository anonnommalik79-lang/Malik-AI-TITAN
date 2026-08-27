from pathlib import Path

path = Path("app/templates/sovereign-hub-ui/lib/transcribe/voice-router.ts")
text = path.read_text(encoding="utf-8")
old = '''        language: "language" in result ? result.language : undefined,\n        durationSec: "durationSec" in result ? result.durationSec : undefined,\n'''
new = '''        language: typeof (result as any).language === "string" ? (result as any).language : undefined,\n        durationSec: typeof (result as any).durationSec === "number" ? (result as any).durationSec : undefined,\n'''
if old not in text:
    raise SystemExit("Voice router result compatibility anchor not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Voice runtime v2 TypeScript result union fixed.")
