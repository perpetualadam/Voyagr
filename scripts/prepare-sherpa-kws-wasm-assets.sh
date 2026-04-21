#!/usr/bin/env bash
# Run from a CLONE of https://github.com/k2-fsa/sherpa-onnx (repo root).
# Populates wasm/kws/assets/ with sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20 files
# renamed to the epoch-12 filenames expected by wasm/kws/CMakeLists.txt.
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

echo "[prepare] Installing into $ASSETS (epoch-12 names for upstream wasm CMake)…"
cp -f "$M/tokens.txt" "$ASSETS/tokens.txt"
cp -f "$M/en.phone" "$ASSETS/en.phone"
cp -f "$M/encoder-epoch-13-avg-2-chunk-16-left-64.int8.onnx" \
  "$ASSETS/encoder-epoch-12-avg-2-chunk-16-left-64.onnx"
cp -f "$M/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" \
  "$ASSETS/decoder-epoch-12-avg-2-chunk-16-left-64.onnx"
cp -f "$M/joiner-epoch-13-avg-2-chunk-16-left-64.onnx" \
  "$ASSETS/joiner-epoch-12-avg-2-chunk-16-left-64.onnx"

echo "[prepare] Done. Next from repo root: ./build-wasm-simd-kws.sh"
echo "Then copy build-wasm-simd-kws/install/bin/wasm/* into Voyagr static/vendor/sherpa-kws/wasm/"
