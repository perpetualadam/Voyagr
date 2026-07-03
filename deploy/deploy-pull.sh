#!/bin/bash
# Standard VPS deploy: pull latest main as root, fix voyagr ownership, restart service.
#
#   sudo bash /opt/voyagr/deploy/deploy-pull.sh
#
# After non-root migration, /opt/voyagr is owned by voyagr — root git needs safe.directory.
set -euo pipefail

APP_DIR="${VOYAGR_APP_DIR:-/opt/voyagr}"
BRANCH="${VOYAGR_DEPLOY_BRANCH:-main}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Not a git repo: $APP_DIR" >&2
  exit 1
fi

echo "=== Voyagr deploy (pull + restart) ==="

if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$APP_DIR"; then
  git config --global --add safe.directory "$APP_DIR"
  echo "[git] Registered safe.directory=$APP_DIR for root"
fi

cd "$APP_DIR"
echo "[git] Fetching origin/$BRANCH..."
git fetch origin "$BRANCH"
git pull origin "$BRANCH"

bash "$APP_DIR/deploy/setup-voyagr-user.sh" --permissions-only --restart

echo ""
echo "Deploy complete. Quick check:"
echo "  curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app-settings"
echo "  systemctl show voyagr -p User,MainPID --no-pager"
