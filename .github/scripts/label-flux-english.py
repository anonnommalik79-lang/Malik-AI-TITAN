from pathlib import Path

path = Path("app/templates/sovereign-hub-ui/components/voice/VoiceSettings.tsx")
text = path.read_text(encoding="utf-8")
old = '<span className={styles.itemText}><strong>{profile.name}</strong><small>{profile.description}</small></span>'
new = '<span className={styles.itemText}><strong>{profile.name} <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">English</span></strong><small>{profile.description}</small></span>'
if old not in text:
    raise SystemExit("Voice name render anchor not found")
text = text.replace(old, new, 1)
text = text.replace('<div className={styles.heading}><span>Голос</span><small>36 Deepgram Flux голосов</small></div>', '<div className={styles.heading}><span>Голос</span><small>36 Deepgram Flux голосов · English</small></div>', 1)
path.write_text(text, encoding="utf-8")
print("Marked all Deepgram Flux voices as English.")
