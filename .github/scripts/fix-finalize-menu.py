from pathlib import Path

chat_path = Path("app/templates/sovereign-hub-ui/components/sovereign/chat-view.tsx")
chat = chat_path.read_text(encoding="utf-8")
old = '''          )}
          )}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">'''
new = '''          )}
        </div>
        <p className="mt-2 hidden text-center text-xs text-slate-600 sm:block">'''
if old not in chat:
    raise SystemExit("Expected duplicated attachment-menu boundary was not found")
chat_path.write_text(chat.replace(old, new, 1), encoding="utf-8")

dashboard_path = Path("app/templates/sovereign-hub-ui/components/sovereign/dashboard.tsx")
dashboard = dashboard_path.read_text(encoding="utf-8")
count = dashboard.count('safeOpenView("plugins", "attachment-menu")')
if count != 2:
    raise SystemExit(f"Expected 2 attachment-menu route reasons, found {count}")
dashboard = dashboard.replace('safeOpenView("plugins", "attachment-menu")', 'safeOpenView("plugins", "manual")')
dashboard_path.write_text(dashboard, encoding="utf-8")

print("Attachment-menu JSX boundary and Plugins routing fixed.")
