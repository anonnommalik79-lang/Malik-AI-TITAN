from pathlib import Path

path = Path("app/templates/sovereign-hub-ui/components/sovereign/chat-view.tsx")
text = path.read_text(encoding="utf-8")
old = '''          )}
          )}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">'''
new = '''          )}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">'''
if old not in text:
    raise SystemExit("Expected duplicated attachment-menu boundary was not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Attachment-menu JSX boundary fixed.")
