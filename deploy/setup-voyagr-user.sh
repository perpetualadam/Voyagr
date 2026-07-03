#!/bin/bash
# Run gunicorn as dedicated user `voyagr` (not root).
# Safe for existing VPS: fixes ownership on writable paths, updates systemd unit.
#
# First-time / migration (creates user, fixes perms, installs unit, restarts):
#   sudo bash /opt/voyagr/deploy/setup-voyagr-user.sh
#
# After `git pull` as root (re-apply ownership without restart):
#   sudo bash /opt/voyagr/deploy/setup-voyagr-user.sh --permissions-only
#
# After `git pull` with service restart:
#   sudo bash /opt/voyagr/deploy/setup-voyagr-user.sh --permissions-only --restart
set -euo pipefail

APP_DIR="${VOYAGR_APP_DIR:-/opt/voyagr}"
SERVICE_USER="${VOYAGR_SERVICE_USER:-voyagr}"
SERVICE_GROUP="${VOYAGR_SERVICE_GROUP:-voyagr}"
PERMISSIONS_ONLY=0
DO_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --permissions-only) PERMISSIONS_ONLY=1 ;;
    --restart) DO_RESTART=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory not found: $APP_DIR" >&2
  exit 1
fi

echo "=== Voyagr non-root service user ==="
echo "App dir: $APP_DIR"
echo "User:    $SERVICE_USER"

fix_permissions() {
  echo "[perms] Ensuring $SERVICE_USER can read app and write runtime files..."

  # Whole tree owned by service user so gunicorn can read code, venv, static, .env.
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR"

  # Secrets: owner-only (service user).
  for secret in .env .api_key .admin_secret; do
    if [[ -f "$APP_DIR/$secret" ]]; then
      chmod 600 "$APP_DIR/$secret"
    fi
  done

  # Writable runtime paths (SQLite WAL/SHM, logs, dashcam storage).
  touch "$APP_DIR/voyagr_web.db" 2>/dev/null || true
  touch "$APP_DIR/voyagr_web.log" 2>/dev/null || true
  touch "$APP_DIR/dashcam.log" 2>/dev/null || true
  mkdir -p "$APP_DIR/dashcam_recordings"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" \
    "$APP_DIR/voyagr_web.db" \
    "$APP_DIR/voyagr_web.log" \
    "$APP_DIR/dashcam.log" \
    "$APP_DIR/dashcam_recordings" 2>/dev/null || true

  # SQLite may create -wal / -shm alongside the db file.
  shopt -s nullglob
  for wal in "$APP_DIR"/voyagr_web.db-wal "$APP_DIR"/voyagr_web.db-shm; do
    [[ -e "$wal" ]] && chown "$SERVICE_USER:$SERVICE_GROUP" "$wal"
  done
  shopt -u nullglob

  echo "[perms] OK"
}

if [[ "$PERMISSIONS_ONLY" -eq 0 ]]; then
  if ! id "$SERVICE_USER" &>/dev/null; then
    echo "[1/4] Creating system user $SERVICE_USER..."
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin \
      --comment "Voyagr PWA (gunicorn)" "$SERVICE_USER"
  else
    echo "[1/4] User $SERVICE_USER already exists"
    usermod -d "$APP_DIR" -s /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null || true
  fi

  echo "[2/4] Fixing ownership and permissions..."
  fix_permissions

  echo "[3/4] Installing systemd unit (User=$SERVICE_USER)..."
  if [[ -f "$APP_DIR/deploy/voyagr.service" ]]; then
    cp "$APP_DIR/deploy/voyagr.service" /etc/systemd/system/voyagr.service
    systemctl daemon-reload
  else
    echo "Warning: $APP_DIR/deploy/voyagr.service not found — update unit manually" >&2
  fi

  echo "[4/4] Enabling and restarting voyagr..."
  systemctl enable voyagr
  systemctl restart voyagr
  sleep 2

  if systemctl is-active --quiet voyagr; then
    echo ""
    echo "=== Success ==="
    echo "voyagr.service is active (running as $SERVICE_USER)"
    systemctl show voyagr -p MainPID,User,Group --no-pager
    echo ""
    echo "Verify:"
    echo "  curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app-settings"
    echo "  journalctl -u voyagr -n 20 --no-pager"
  else
    echo "ERROR: voyagr.service failed to start. Check:" >&2
    echo "  journalctl -u voyagr -n 50 --no-pager" >&2
    exit 1
  fi
else
  fix_permissions
  if [[ "$DO_RESTART" -eq 1 ]]; then
    echo "Restarting voyagr..."
    systemctl restart voyagr
  else
    echo "Permissions updated. Restart when ready:"
    echo "  sudo systemctl restart voyagr"
  fi
fi

echo ""
echo "After future git pulls as root, re-run:"
echo "  sudo bash $APP_DIR/deploy/setup-voyagr-user.sh --permissions-only --restart"
