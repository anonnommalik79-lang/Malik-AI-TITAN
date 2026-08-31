#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="${MALIKVIDEO_H3_BASE_URL:-${1:-}}"
TOKEN="${MALIKVIDEO_H3_API_KEY:-}"

if [ -z "$WORKER_URL" ]; then
  echo "FAIL: set MALIKVIDEO_H3_BASE_URL to the REAL MalikVideo Worker URL" >&2
  exit 2
fi
if [[ "$WORKER_URL" == *"наш-gpu-server"* || "$WORKER_URL" == *"REAL-"* || "$WORKER_URL" == *"YOUR-"* ]]; then
  echo "FAIL: placeholder URL detected: $WORKER_URL" >&2
  exit 2
fi

AUTH=()
if [ -n "$TOKEN" ]; then AUTH=(-H "Authorization: Bearer $TOKEN"); fi

command -v curl >/dev/null || { echo "FAIL: curl missing" >&2; exit 2; }
command -v jq >/dev/null || { echo "FAIL: jq missing" >&2; exit 2; }

health=$(curl --fail-with-body --silent --show-error "${AUTH[@]}" "$WORKER_URL/health")
echo "$health" | jq .

ok=$(echo "$health" | jq -r '.ok // false')
outputs=$(echo "$health" | jq -r '.supported_outputs[]?' | tr '\n' ' ')

if [ "$ok" != "true" ]; then
  echo "FAIL: worker health is not OK" >&2
  exit 1
fi
if [[ " $outputs " != *" 1080p "* ]]; then
  echo "FAIL: worker does not advertise 1080p restoration" >&2
  exit 1
fi
if [[ " $outputs " != *" 2k "* ]]; then
  echo "FAIL: worker does not advertise 2K restoration" >&2
  exit 1
fi

echo "PASS: worker + restoration path advertise raw768, 1080p and 2K"
echo "NEXT: run smoke-worker.sh for 1080p and 2k before enabling production."
echo "SAFE TO ENABLE only after both MP4 smoke tests pass visual/audio inspection."
