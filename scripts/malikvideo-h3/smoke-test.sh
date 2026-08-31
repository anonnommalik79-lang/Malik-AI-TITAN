#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${MALIKVIDEO_H3_BASE_URL:-http://127.0.0.1:30010}}"
PROMPT="${2:-A black hypercar drives through a rain-soaked futuristic city at night, low tracking camera, realistic reflections, synchronized engine sound and wet tire noise.}"
OUT="${3:-malikvideo-h3-smoke.mp4}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

echo "[MalikVideo] submitting H3 test to $BASE_URL"
video_id=$(
  jq -n --arg prompt "$PROMPT" '{
    task: "t2va",
    prompt: $prompt,
    conditions: [],
    target: {
      short_edge: 768,
      aspect_ratio: "16:9",
      duration_seconds: 5
    },
    seed: 0
  }' | curl --fail-with-body --silent --show-error \
    --request POST \
    --url "$BASE_URL/v1/videos" \
    --header 'Content-Type: application/json' \
    --data-binary @- | jq -er '.id'
)

echo "[MalikVideo] video id: $video_id"

while true; do
  response=$(curl --fail-with-body --silent --show-error "$BASE_URL/v1/videos/$video_id")
  status=$(printf '%s' "$response" | jq -r '.status // .state // "unknown"')
  echo "[MalikVideo] status=$status"

  case "${status,,}" in
    completed|complete|succeeded|success|done)
      break
      ;;
    failed|error|cancelled|canceled)
      printf '%s\n' "$response" | jq . >&2
      exit 1
      ;;
  esac

  sleep 10
done

curl --fail-with-body --silent --show-error \
  "$BASE_URL/v1/videos/$video_id/content" \
  --output "$OUT"

echo "[MalikVideo] DONE -> $OUT"
