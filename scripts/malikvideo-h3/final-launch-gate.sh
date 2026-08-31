#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MALIKVIDEO_H3_BASE_URL:-}"
TOKEN="${MALIKVIDEO_H3_API_KEY:-}"
RATIO="${MALIKVIDEO_SMOKE_RATIO:-16:9}"
OUT_1080="${MALIKVIDEO_SMOKE_1080_FILE:-malikvideo-final-1080p.mp4}"
OUT_2K="${MALIKVIDEO_SMOKE_2K_FILE:-malikvideo-final-2k.mp4}"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -n "$BASE_URL" ] || fail "set MALIKVIDEO_H3_BASE_URL to the REAL MalikVideo Worker URL"
[ -n "$TOKEN" ] || fail "set MALIKVIDEO_H3_API_KEY to the private worker token"
command -v python3 >/dev/null || fail "python3 missing"
command -v ffprobe >/dev/null || fail "ffprobe missing"

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

printf '\n=== 1/5 PRE-FLIGHT ===\n'
bash "$SCRIPT_DIR/preflight.sh"

printf '\n=== 2/5 REAL 1080P GENERATION ===\n'
bash "$SCRIPT_DIR/smoke-worker.sh" "$BASE_URL" 1080p "$OUT_1080"

printf '\n=== 3/5 VERIFY TRUE 1080P + AUDIO ===\n'
python3 "$SCRIPT_DIR/verify-final-video.py" "$OUT_1080" --resolution 1080p --ratio "$RATIO"

printf '\n=== 4/5 REAL 2K GENERATION ===\n'
bash "$SCRIPT_DIR/smoke-worker.sh" "$BASE_URL" 2k "$OUT_2K"

printf '\n=== 5/5 VERIFY TRUE 2K + AUDIO ===\n'
python3 "$SCRIPT_DIR/verify-final-video.py" "$OUT_2K" --resolution 2k --ratio "$RATIO"

cat <<EOF

============================================================
MALIKVIDEO PRODUCTION GATE: PASS
============================================================
Both final files passed fail-closed media validation:
  1080p: $OUT_1080
  2K:    $OUT_2K

Before enabling public traffic, open both files and visually inspect temporal consistency,
faces/hands/wheels, lighting, motion, duration and subjective audio sync.

Only after that visual check, set the Malik AI production environment to:
MALIKVIDEO_H3_ENABLED=true
MALIKVIDEO_H3_MODE=worker
MALIKVIDEO_H3_BASE_URL=$BASE_URL
MALIKVIDEO_H3_API_KEY=<same private worker token>
VIDEO_PROVIDER_ORDER=h3,dashscope,pollo,runway,fal,luma,veo
============================================================
EOF
