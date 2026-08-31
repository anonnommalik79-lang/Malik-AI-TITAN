#!/usr/bin/env bash
set -euo pipefail

# MalikVideo H3 FL2VA launcher.
# FL2VA serves both text-to-video (t2va) and first-frame image-to-video (fl2va).
# Profiles below follow the current official SGLang MiniMax-H3 deployment cookbook.

PROFILE="${MALIKVIDEO_H3_PROFILE:-h100x4}"
PORT="${MALIKVIDEO_H3_PORT:-30010}"
MODEL_PATH="${MALIKVIDEO_H3_MODEL_PATH:-MiniMaxAI/MiniMax-H3}"
HOST="${MALIKVIDEO_H3_HOST:-0.0.0.0}"

COMMON=(
  --model-path "$MODEL_PATH"
  --model-variant fl2va
  --host "$HOST"
  --port "$PORT"
)

echo "[MalikVideo] starting MiniMax H3 FL2VA profile=$PROFILE port=$PORT"

case "$PROFILE" in
  h200x4)
    exec sglang serve \
      "${COMMON[@]}" \
      --num-gpus 4 \
      --ulysses-degree 4 \
      --encoder-parallel auto \
      --performance-mode speed
    ;;

  h100x4)
    exec sglang serve \
      "${COMMON[@]}" \
      --num-gpus 4 \
      --tp-size 2 \
      --ulysses-degree 2 \
      --encoder-parallel auto \
      --performance-mode speed
    ;;

  rtx5090x2)
    exec sglang serve \
      "${COMMON[@]}" \
      --num-gpus 2 \
      --tp-size 2 \
      --ulysses-degree 1 \
      --encoder-parallel auto \
      --performance-mode memory \
      --layerwise-offload-components dit,text_encoder,vae \
      --dit-offload-prefetch-size 1 \
      --dit-layerwise-resident-layers 20 \
      --enable-torch-compile false
    ;;

  *)
    echo "Unknown MALIKVIDEO_H3_PROFILE=$PROFILE" >&2
    echo "Supported: h200x4, h100x4, rtx5090x2" >&2
    exit 2
    ;;
esac
