from pathlib import Path

def ensure_dir(path: str):
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return str(target)
