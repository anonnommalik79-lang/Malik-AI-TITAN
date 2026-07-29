from pathlib import Path
import re

root = Path("app/templates/sovereign-hub-ui")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


auth_path = root / "components/sovereign/auth-screen.tsx"
auth = read(auth_path)

auth, count = re.subn(
    r"const ADMINS = \[.*?\]\n",
    "const ADMINS: string[] = []\n",
    auth,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f"ADMINS block: expected 1 match, found {count}")

auth, count = re.subn(
    r"function isAdminEmail\(email\?: string \| null\) \{.*?\n\}",
    "function isAdminEmail(_email?: string | null) {\n  // Privileged access must come from a server-signed session, never a browser email.\n  return false\n}",
    auth,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f"isAdminEmail: expected 1 match, found {count}")

auth = replace_once(auth, "    isAdmin: isAdminEmail(cleanEmail),", "    isAdmin: false,", "local isAdmin")
auth = replace_once(
    auth,
    "    isAdmin: isAdminEmail(email),",
    '    isAdmin: Boolean(user?.app_metadata?.role === "owner" || user?.app_metadata?.is_admin === true),',
    "Supabase isAdmin",
)
auth = replace_once(
    auth,
    """        if (!supabase) {
          const snapshot = persistLocalEmailSnapshot(cleanEmail, displayName)
          completeSession(snapshot)
          return
        }""",
    """        if (!supabase) {
          setError("Авторизация временно недоступна. Используйте безопасный гостевой вход.")
          setStage("error")
          return
        }""",
    "missing Supabase fallback",
)
auth = replace_once(
    auth,
    """        const snapshot = persistLocalEmailSnapshot(cleanEmail, displayName)
        setError(`${normalized} Local access opened.`)
        completeSession(snapshot)""",
    """        setError(normalized)
        setStage("error")""",
    "auth error fallback",
)
write(auth_path, auth)


dashboard_path = root / "components/sovereign/dashboard.tsx"
dashboard = read(dashboard_path)
entries = '''  capabilities: {
    id: "capabilities",
    title: "Capabilities",
    description: "Practical AI capabilities catalog.",
    bucket: "core",
    icon: "sparkles",
    status: "stable",
    mobileMode: "full",
    fallbackView: "home",
    keywords: ["capabilities", "abilities", "возможности"],
  },
  "business-command-center": {
    id: "business-command-center",
    title: "Business Command Center",
    description: "Business AI modes and execution cockpit.",
    bucket: "core",
    icon: "briefcase",
    status: "stable",
    mobileMode: "full",
    fallbackView: "command-center",
    keywords: ["business", "business command center", "бизнес"],
  },
  "media-newsroom": {
    id: "media-newsroom",
    title: "Newsroom Studio",
    description: "News, fact-checking and multilingual media studio.",
    bucket: "core",
    icon: "newspaper",
    status: "stable",
    mobileMode: "full",
    fallbackView: "ai-generator",
    keywords: ["newsroom", "media", "news", "сми", "новости"],
  },
'''
if '  capabilities: {\n    id: "capabilities"' not in dashboard:
    dashboard = replace_once(dashboard, "  features: {\n", entries + "  features: {\n", "view registry")
write(dashboard_path, dashboard)

assert "Local access opened" not in auth
assert "isAdmin: false" in auth
assert 'id: "capabilities"' in dashboard
assert 'id: "business-command-center"' in dashboard
assert 'id: "media-newsroom"' in dashboard
print("UI security and routing patches applied")
