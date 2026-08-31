#!/usr/bin/env bash
set -euo pipefail

ROOT="${MALIKVIDEO_SEEDVR_ROOT:-/opt/SeedVR}"
REPO="${MALIKVIDEO_SEEDVR_REPO:-https://github.com/ByteDance-Seed/SeedVR.git}"

if [ ! -d "$ROOT/.git" ]; then
  git clone --depth 1 "$REPO" "$ROOT"
fi

cd "$ROOT"
python3 -m pip install --break-system-packages -r requirements.txt

echo "[MalikVideo Enhancer] SeedVR2 ready at $ROOT"
