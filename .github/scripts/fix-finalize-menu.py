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

account_path = Path("app/templates/sovereign-hub-ui/scripts/verify-account-and-search.mjs")
account = account_path.read_text(encoding="utf-8")
old_title = 'await check("two plans; exactly two free models", () => {'
new_title = 'await check("two plans; three live free MalikLLM models", () => {'
old_models = 'assert.deepEqual(FREE_MALIK_MODELS.map(m => m.label), ["MalikAI20B", "MalikAI120B Fast"])'
new_models = 'assert.deepEqual(FREE_MALIK_MODELS.map(m => m.label), ["MalikLLM 20B", "MalikLLM Fast 120B", "MalikLLM Qwen3.8 27B"])'
if old_title not in account or old_models not in account:
    raise SystemExit("Expected legacy account/model assertions were not found")
account = account.replace(old_title, new_title).replace(old_models, new_models)
account_path.write_text(account, encoding="utf-8")

print("Attachment menu, Plugins routing, and account model expectations fixed.")
