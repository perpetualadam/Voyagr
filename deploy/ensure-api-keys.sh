#!/bin/bash
# Ensure API_KEYS exists on an existing Voyagr VPS (Contabo / gunicorn).
# Safe for the PWA: /api/route does not require X-API-Key.
set -euo pipefail

APP_DIR="${1:-/opt/voyagr}"
cd "$APP_DIR"

ENV_FILE="$APP_DIR/.env"
KEY_FILE="$APP_DIR/.api_key"

if grep -q '^API_KEYS=' "$ENV_FILE" 2>/dev/null; then
  echo "API_KEYS already set in $ENV_FILE"
  exit 0
fi

if [[ -s "$KEY_FILE" ]]; then
  KEY=$(tr -d '\n' < "$KEY_FILE")
  echo "API_KEYS=$KEY" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Appended API_KEYS from existing $KEY_FILE to $ENV_FILE"
else
  KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
  {
    echo ""
    echo "# Added by deploy/ensure-api-keys.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "API_KEYS=$KEY"
    echo "FLASK_ENV=production"
    echo "ENVIRONMENT=production"
    echo "VOYAGR_TRUST_PROXY=1"
  } >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Generated API_KEYS and appended to $ENV_FILE (value not printed)"
fi

if [[ -f /etc/systemd/system/voyagr.service ]] && ! grep -q 'EnvironmentFile=-/opt/voyagr/.env' /etc/systemd/system/voyagr.service; then
  echo "Tip: add to voyagr.service: EnvironmentFile=-/opt/voyagr/.env"
  echo "  Then: sudo systemctl daemon-reload && sudo systemctl restart voyagr"
fi

echo "Restart Voyagr to clear the startup warning:"
echo "  sudo systemctl restart voyagr"
