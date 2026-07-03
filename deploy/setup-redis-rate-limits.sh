#!/bin/bash
# Optional: Redis for shared Flask-Limiter + /api/route rate limits across gunicorn workers.
# Safe: if Redis fails, Voyagr falls back to in-memory limits and keeps running.
set -euo pipefail

APP_DIR="${1:-/opt/voyagr}"
ENV_FILE="$APP_DIR/.env"

echo "=== Voyagr Redis rate-limit setup ==="

if ! command -v redis-server >/dev/null 2>&1; then
  echo "[1/4] Installing redis-server..."
  apt-get update
  apt-get install -y redis-server
else
  echo "[1/4] redis-server already installed"
fi

echo "[2/4] Ensuring Redis listens on localhost only..."
if [[ -f /etc/redis/redis.conf ]]; then
  if grep -q '^bind ' /etc/redis/redis.conf; then
    sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
  fi
fi
systemctl enable redis-server
systemctl restart redis-server

echo "[3/4] Installing Python redis client in venv (if present)..."
if [[ -x "$APP_DIR/venv/bin/pip" ]]; then
  "$APP_DIR/venv/bin/pip" install -q 'redis>=5.0.0' 'Flask-Limiter>=3.5.0'
fi

echo "[4/4] Updating $ENV_FILE..."
touch "$ENV_FILE"
if grep -q '^RATELIMIT_STORAGE_URI=' "$ENV_FILE" 2>/dev/null; then
  echo "RATELIMIT_STORAGE_URI already set in $ENV_FILE"
else
  echo 'RATELIMIT_STORAGE_URI=redis://127.0.0.1:6379/0' >> "$ENV_FILE"
  echo "Appended RATELIMIT_STORAGE_URI=redis://127.0.0.1:6379/0"
fi

if redis-cli ping | grep -q PONG; then
  echo "Redis ping: OK"
else
  echo "Warning: redis-cli ping failed — Voyagr will use in-memory fallback until Redis is up"
fi

echo ""
echo "Restart Voyagr:"
echo "  sudo systemctl restart voyagr"
echo ""
echo "Expect in logs:"
echo "  [SECURITY] Redis rate-limit storage OK"
echo "  [SECURITY] Flask-Limiter enabled (storage=redis)"

if id voyagr &>/dev/null && [[ -f "$APP_DIR/deploy/setup-voyagr-user.sh" ]]; then
  bash "$APP_DIR/deploy/setup-voyagr-user.sh" --permissions-only
fi
