#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${MALIKVIDEO_H3_BASE_URL:-http://127.0.0.1:8010}}"
OUTPUT_RESOLUTION="${2:-1080p}"
OUT="${3:-malikvideo-worker-smoke-${OUTPUT_RESOLUTION}.mp4}"
TOKEN="${MALIKVIDEO_H3_API_KEY:-}"
AUTH=()
if [ -n "$TOKEN" ]; then AUTH=(-H "Authorization: Bearer $TOKEN"); fi

command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

curl --fail-with-body --silent --show-error "${AUTH[@]}" "$BASE_URL/health" | jq .

job_id=$(
  jq -n --arg output "$OUTPUT_RESOLUTION" '{
    task: "t2va",
    prompt: "A black hypercar drives through rain-soaked Almaty at night, low side tracking camera, realistic wet-road reflections, physically coherent wheel motion, synchronized engine and tire sound.",
    conditions: [],
    target: {short_edge: 768, aspect_ratio: "16:9", duration_seconds: 5},
    output_resolution: $output,
    seed: 0
  }' | curl --fail-with-body --silent --show-error \
      "${AUTH[@]}" \
      -H 'Content-Type: application/json' \
      -X POST "$BASE_URL/v1/videos" \
      --data-binary @- | jq -er '.id'
)

echo "[MalikVideo] worker job=$job_id output=$OUTPUT_RESOLUTION"

while true; do
  response=$(curl --fail-with-body --silent --show-error "${AUTH[@]}" "$BASE_URL/v1/videos/$job_id")
  status=$(printf '%s' "$response" | jq -r '.status')
  stage=$(printf '%s' "$response" | jq -r '.stage // "unknown"')
  echo "[MalikVideo] status=$status stage=$stage"
  case "$status" in
    completed) break ;;
    failed)
      printf '%s\n' "$response" | jq . >&2
      exit 1
      ;;
  esac
  sleep 10
done

curl --fail-with-body --silent --show-error "${AUTH[@]}" \
  "$BASE_URL/v1/videos/$job_id/content" -o "$OUT"

echo "[MalikVideo] FINAL -> $OUT"
