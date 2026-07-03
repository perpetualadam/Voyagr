#!/bin/bash
# Install Voyagr nginx security header snippet and reload nginx (HTTPS sites only).
# Does not replace your live vhost — merges the snippet file only.
set -euo pipefail

APP_DIR="${1:-/opt/voyagr}"
SNIPPET_SRC="$APP_DIR/deploy/nginx-security-headers.snippet.conf"
SNIPPET_DST="/etc/nginx/snippets/voyagr-security-headers.conf"

if [[ ! -f "$SNIPPET_SRC" ]]; then
  echo "Missing $SNIPPET_SRC — git pull in $APP_DIR first."
  exit 1
fi

cp "$SNIPPET_SRC" "$SNIPPET_DST"
chmod 644 "$SNIPPET_DST"
echo "Installed $SNIPPET_DST"

echo ""
echo "Ensure your HTTPS server { } block includes:"
echo "  include snippets/voyagr-security-headers.conf;"
echo ""
echo "For vibevoyager.org, update from repo then:"
echo "  sudo cp $APP_DIR/deploy/nginx-vibevoyager.org.conf /etc/nginx/sites-available/vibevoyager.org"
echo "  (merge ssl_certificate paths if Certbot changed them)"
echo ""

nginx -t
systemctl reload nginx
echo "nginx reloaded OK"
