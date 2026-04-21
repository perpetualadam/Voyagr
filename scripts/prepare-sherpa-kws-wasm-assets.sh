#!/usr/bin/env bash
# Run from a CLONE of https://github.com/k2-fsa/sherpa-onnx (repo root).
# Populates wasm/kws/assets/ with sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20
# files using their native epoch-13 filenames. Voyagr's JS config now references
# epoch-13 directly (static/js/sherpa-onnx-kws-spike.js + sherpa-kws-map-runtime.js),
# so no renaming step is needed. If you rebuild the upstream WASM with the stock
# CMakeLists.txt (which bakes epoch-12 names into its --preload-file list) you'll
# need to patch those paths or use `--embed-file`/lazy-fetch so the runtime can
# find epoch-13 files at the paths our JS asks for.
set -euo pipefail
ROOT="${1:-.}"
ASSETS="$ROOT/wasm/kws/assets"
MODEL_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ ! -d "$ROOT/wasm/kws/assets" ]]; then
  echo "Usage: $0 /path/to/sherpa-onnx-clone"
  exit 1
fi

mkdir -p "$ASSETS"
cd "$WORKDIR"
echo "[prepare] Downloading KWS model…"
curl -sSL -o model.tar.bz2 "$MODEL_URL"
tar xf model.tar.bz2
M="sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20"

echo "[prepare] Installing into $ASSETS (epoch-13 names — no rename)…"
cp -f "$M/tokens.txt" "$ASSETS/tokens.txt"
cp -f "$M/en.phone" "$ASSETS/en.phone"
cp -f "$M/encoder-epoch-13-avg-2-chunk-16-left-64.onnx" "$ASSETS/"
cp -f "$M/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" "$ASSETS/"
cp -f "$M/joiner-epoch-13-avg-2-chunk-16-left-64.onnx" "$ASSETS/"

echo "[prepare] Done. Next from repo root: ./build-wasm-simd-kws.sh"
echo "Then copy build-wasm-simd-kws/install/bin/wasm/* into Voyagr static/vendor/sherpa-kws/wasm/"
