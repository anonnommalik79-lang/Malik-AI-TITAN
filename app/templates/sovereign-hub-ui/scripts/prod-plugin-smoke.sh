#!/usr/bin/env bash
set -euo pipefail

BASE="https://malikaiworld.world"

echo "== HOME =="
curl -sS -D /tmp/home.headers -o /tmp/home.body --max-time 25 "$BASE/"
head -n 20 /tmp/home.headers
printf 'body-bytes='; wc -c < /tmp/home.body

echo "== DASHBOARD (no auth) =="
curl -sS -D /tmp/dashboard.headers -o /tmp/dashboard.body --max-time 25 "$BASE/dashboard"
head -n 20 /tmp/dashboard.headers
printf 'body-bytes='; wc -c < /tmp/dashboard.body

echo "== GITHUB CONNECT (no auth, no redirects) =="
status=$(curl -sS -D /tmp/connect.headers -o /tmp/connect.body --max-time 25 -w '%{http_code}' "$BASE/api/plugins/connect?id=github&return_to=%2Fdashboard")
echo "status=$status"
cat /tmp/connect.headers
printf 'body='; head -c 500 /tmp/connect.body || true; echo

location=$(awk 'BEGIN{IGNORECASE=1} /^location:/{sub(/^[^:]+:[[:space:]]*/,""); sub(/\r$/,""); print; exit}' /tmp/connect.headers)
echo "location=$location"

if [[ "$status" != "302" && "$status" != "303" && "$status" != "307" && "$status" != "308" ]]; then
  echo "Expected redirect from unauthenticated connect route, got $status" >&2
  exit 1
fi

if [[ "$location" != https://malikaiworld.world/sign-in* ]]; then
  echo "Expected canonical Malik AI sign-in redirect, got: $location" >&2
  exit 1
fi

if [[ "$location" == *"localhost"* || "$location" == *":10000"* ]]; then
  echo "Render internal origin leaked into public redirect: $location" >&2
  exit 1
fi

echo "SMOKE_OK: live GitHub connect route uses the canonical malikaiworld.world sign-in origin."
