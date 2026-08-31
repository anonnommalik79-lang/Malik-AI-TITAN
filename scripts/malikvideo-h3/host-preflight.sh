#!/usr/bin/env bash
set -euo pipefail

PROFILE="${MALIKVIDEO_H3_PROFILE:-h100x4}"
MIN_FREE_GB="${MALIKVIDEO_MIN_FREE_DISK_GB:-250}"

fail() { echo "FAIL: $*" >&2; exit 1; }
warn() { echo "WARN: $*" >&2; }
pass() { echo "PASS: $*"; }

command -v nvidia-smi >/dev/null || fail "nvidia-smi missing; this is not a usable NVIDIA GPU host"
command -v sglang >/dev/null || fail "sglang command missing"
command -v curl >/dev/null || fail "curl missing"
command -v jq >/dev/null || fail "jq missing"
command -v ffmpeg >/dev/null || fail "ffmpeg missing"
command -v ffprobe >/dev/null || fail "ffprobe missing"

mapfile -t GPU_LINES < <(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits)
GPU_COUNT="${#GPU_LINES[@]}"
[ "$GPU_COUNT" -gt 0 ] || fail "no NVIDIA GPUs detected"

echo "Detected GPUs:"
printf '  %s\n' "${GPU_LINES[@]}"

case "$PROFILE" in
  h200x4)
    [ "$GPU_COUNT" -ge 4 ] || fail "h200x4 requires at least 4 visible GPUs"
    printf '%s\n' "${GPU_LINES[@]:0:4}" | grep -qi 'H200' || warn "profile is h200x4 but first four GPU names are not all clearly H200"
    ;;
  h100x4)
    [ "$GPU_COUNT" -ge 4 ] || fail "h100x4 requires at least 4 visible GPUs"
    printf '%s\n' "${GPU_LINES[@]:0:4}" | grep -Eqi 'H100|H200' || warn "profile is h100x4 but first four GPU names are not clearly H100/H200"
    ;;
  rtx5090x2)
    [ "$GPU_COUNT" -ge 2 ] || fail "rtx5090x2 requires at least 2 visible GPUs"
    ;;
  *)
    fail "unsupported MALIKVIDEO_H3_PROFILE=$PROFILE"
    ;;
esac

FREE_KB=$(df -Pk "${MALIKVIDEO_MODEL_STORAGE_PATH:-$HOME}" | awk 'NR==2 {print $4}')
FREE_GB=$((FREE_KB / 1024 / 1024))
if [ "$FREE_GB" -lt "$MIN_FREE_GB" ]; then
  fail "only ${FREE_GB}GB free; require at least ${MIN_FREE_GB}GB for weights/cache/output headroom"
fi
pass "disk headroom ${FREE_GB}GB"

RAM_KB=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
RAM_GB=$((RAM_KB / 1024 / 1024))
if [ "$PROFILE" = "rtx5090x2" ] && [ "$RAM_GB" -lt 192 ]; then
  warn "5090 offload profile has only ${RAM_GB}GB host RAM; large host RAM is strongly recommended"
else
  pass "host RAM ${RAM_GB}GB"
fi

pass "GPU host preflight for $PROFILE"
echo "NEXT: bash scripts/malikvideo-h3/launch-fl2va.sh"
