import re

_RULES = [
    ("video", re.compile(r"видео|video|ролик|veo|luma|runway", re.I)),
    ("image", re.compile(r"фото|image|photo|картин|нарис", re.I)),
    ("code", re.compile(r"код|code|react|python|debug|api", re.I)),
    ("website", re.compile(r"сайт|website|landing|ui|dashboard", re.I)),
]

def detect_kind(prompt: str) -> str:
    for kind, rule in _RULES:
        if rule.search(prompt or ""):
            return kind
    return "chat"
