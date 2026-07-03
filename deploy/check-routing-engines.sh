#!/bin/bash
# Check local Valhalla + GraphHopper from the Voyagr VPS (run as root).
#
#   sudo bash /opt/voyagr/deploy/check-routing-engines.sh
#
# Optional: pass admin key to hit /api/test-routing-engines through gunicorn:
#   sudo bash /opt/voyagr/deploy/check-routing-engines.sh --via-app
set -euo pipefail

APP_DIR="${VOYAGR_APP_DIR:-/opt/voyagr}"
VALHALLA_URL="${VALHALLA_URL:-http://127.0.0.1:8002}"
GRAPHHOPPER_URL="${GRAPHHOPPER_URL:-http://127.0.0.1:8989}"
VIA_APP=0

for arg in "$@"; do
  case "$arg" in
    --via-app) VIA_APP=1 ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
  esac
done

echo "=== Voyagr routing engine health ==="
echo "Valhalla:    $VALHALLA_URL"
echo "GraphHopper: $GRAPHHOPPER_URL"
echo ""

fail=0

echo "[1/4] Valhalla /status"
if curl -sf --max-time 5 "$VALHALLA_URL/status" >/dev/null; then
  echo "  OK"
else
  echo "  FAIL — Valhalla not responding on $VALHALLA_URL"
  echo "  Try: docker ps -a | grep valhalla"
  echo "       docker start valhalla   # or: docker restart valhalla"
  echo "       docker logs valhalla --tail 30"
  fail=1
fi

echo "[2/4] Valhalla sample route (Doncaster area)"
vrec=$(curl -sf --max-time 15 -X POST "$VALHALLA_URL/route" \
  -H 'Content-Type: application/json' \
  -d '{"locations":[{"lat":53.536,"lon":-1.380},{"lat":53.517,"lon":-1.150}],"costing":"auto","alternates":1}' \
  2>/dev/null || true)
if [[ -n "$vrec" ]] && echo "$vrec" | grep -q '"trip"'; then
  echo "  OK (trip returned)"
else
  echo "  FAIL — route request did not return a trip"
  echo "  Body: $(echo "$vrec" | head -c 200)"
  fail=1
fi

echo "[3/4] GraphHopper sample route"
ghcode=$(curl -s -o /tmp/gh-check.json -w '%{http_code}' --max-time 10 \
  "$GRAPHHOPPER_URL/route?point=53.536,-1.380&point=53.517,-1.150&profile=car" || echo "000")
if [[ "$ghcode" == "200" ]] && grep -q '"paths"' /tmp/gh-check.json 2>/dev/null; then
  echo "  OK"
else
  echo "  FAIL — HTTP $ghcode"
  echo "  Try: systemctl status graphhopper"
  echo "       systemctl restart graphhopper"
  echo "       journalctl -u graphhopper -n 30 --no-pager"
  head -c 200 /tmp/gh-check.json 2>/dev/null || true
  echo ""
  fail=1
fi

echo "[4/4] Recent voyagr routing logs"
journalctl -u voyagr -n 80 --no-pager 2>/dev/null | grep -iE 'Valhalla|GraphHopper|OSRM|ROUTING|Connection error' | tail -15 || true

if [[ "$VIA_APP" -eq 1 ]]; then
  echo ""
  echo "[app] /api/test-routing-engines (needs VOYAGR_ADMIN_SECRET in .env)"
  if [[ -f "$APP_DIR/.env" ]]; then
    # shellcheck disable=SC1090
    source "$APP_DIR/.env" 2>/dev/null || true
  fi
  if [[ -n "${VOYAGR_ADMIN_SECRET:-}" ]]; then
    curl -sf --max-time 10 \
      -H "X-Voyagr-Admin-Key: $VOYAGR_ADMIN_SECRET" \
      "http://127.0.0.1:5000/api/test-routing-engines" | python3 -m json.tool 2>/dev/null || echo "  app probe failed"
  else
    echo "  skipped (VOYAGR_ADMIN_SECRET not set)"
  fi
fi

echo ""
if [[ "$fail" -eq 0 ]]; then
  echo "=== All local engines OK ==="
  echo "If the PWA still shows OSRM (Fallback), restart voyagr:"
  echo "  sudo systemctl restart voyagr"
else
  echo "=== One or more engines DOWN ==="
  echo "Fix Valhalla/GraphHopper above, then:"
  echo "  sudo systemctl restart voyagr"
  echo "Re-test a route — expect source GraphHopper+Valhalla or Valhalla, not OSRM (Fallback)."
  exit 1
fi
