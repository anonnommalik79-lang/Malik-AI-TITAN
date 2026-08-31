#!/usr/bin/env python3
from __future__ import annotations

import secrets


def main() -> None:
    print("MALIKVIDEO_WORKER_API_KEY=" + secrets.token_urlsafe(48))
    print("MALIKVIDEO_ENHANCER_API_KEY=" + secrets.token_urlsafe(48))
    print("\nStore these only in provider secret managers. Do not commit or screenshot them.")


if __name__ == "__main__":
    main()
