import time
from collections import defaultdict

_BUCKETS = defaultdict(list)

def allow(key: str, limit: int = 20, per: int = 60):
    now = time.time()
    _BUCKETS[key] = [x for x in _BUCKETS[key] if now - x < per]
    if len(_BUCKETS[key]) >= limit:
        return False
    _BUCKETS[key].append(now)
    return True
