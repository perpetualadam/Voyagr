#!/bin/bash
# Ensure VOYAGR_ADMIN_SECRET exists for ops/debug route protection.
# Safe for the PWA: /api/route and normal navigation do not use this key.
#
# Usage on VPS (as root):
#   sudo bash /opt/voyagr/deploy/ensure-admin-secret.sh
#
# When a new secret is created, it is printed ONCE — save it in a password manager.
set -euo pipefail

APP_DIR="${1:-/opt/voyagr}"
cd "$APP_DIR"

ENV_FILE="$APP_DIR/.env"
KEY_FILE="$APP_DIR/.admin_secret"

if grep -q '^VOYAGR_ADMIN_SECRET=' "$ENV_FILE" 2>/dev/null; then
  echo "VOYAGR_ADMIN_SECRET is already set in $ENV_FILE"
  echo ""
  echo "To view it (you are root on the server):"
  echo "  grep '^VOYAGR_ADMIN_SECRET=' $ENV_FILE"
  if [[ -s "$KEY_FILE" ]]; then
    echo "Or read the backup copy:"
    echo "  cat $KEY_FILE"
  fi
  exit 0
fi

if [[ -s "$KEY_FILE" ]]; then
  KEY=$(tr -d '\n' < "$KEY_FILE")
  echo "VOYAGR_ADMIN_SECRET=$KEY" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  chmod 600 "$KEY_FILE" 2>/dev/null || true
  echo "Appended VOYAGR_ADMIN_SECRET from existing $KEY_FILE to $ENV_FILE"
  echo ""
  echo "Your admin key (same as in $KEY_FILE):"
  echo "$KEY"
  exit 0
fi

KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
printf '%s' "$KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE" 2>/dev/null || true

{
  echo ""
  echo "# Added by deploy/ensure-admin-secret.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "VOYAGR_ADMIN_SECRET=$KEY"
} >> "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo "=============================================="
echo " NEW ADMIN KEY — save this somewhere safe"
echo " (password manager / offline note)"
echo "=============================================="
echo ""
echo "$KEY"
echo ""
echo "Use header:  X-Voyagr-Admin-Key: $KEY"
echo ""
echo "Also saved to:"
echo "  $ENV_FILE"
echo "  $KEY_FILE"
echo ""
echo "Restart Voyagr:"
echo "  sudo systemctl restart voyagr"
