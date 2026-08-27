from pathlib import Path

path = Path("app/templates/sovereign-hub-ui/scripts/verify-voice-mode.mjs")
text = path.read_text(encoding="utf-8")
old1 = '  ["01 empty home composer shows Voice", () => assert.match(home, /prompt\\.trim\\(\\) && "is-hidden"/)],\n'
new1 = '  ["01 empty home composer shows Voice and content shows Send", () => { assert.match(home, /hasSendableContent && "is-hidden"/); assert.match(home, /!hasSendableContent && "is-hidden"/) }],\n'
old2 = '  ["02 active chat has the same Voice\\/Send switch", () => assert.match(chat, /malik-voice-entry[\\s\\S]*!prompt\\.trim\\(\\) && "is-hidden"/)],\n'
new2 = '  ["02 active chat has the same Voice\\/Send switch", () => { assert.match(chat, /malik-voice-entry[\\s\\S]*prompt\\.trim\\(\\) && "is-hidden"/); assert.match(chat, /malik-inline-send[\\s\\S]*!prompt\\.trim\\(\\) && "is-hidden"/) }],\n'
if old1 in text:
    text = text.replace(old1, new1, 1)
elif "01 empty home composer shows Voice and content shows Send" not in text:
    raise SystemExit("Voice regression check 01 anchor not found")
if old2 in text:
    text = text.replace(old2, new2, 1)
elif "malik-inline-send" not in text:
    raise SystemExit("Voice regression check 02 anchor not found")
path.write_text(text, encoding="utf-8")
print("Voice regression aligned with current Home/Chat composers.")
