#!/usr/bin/env bash
set -euo pipefail

############################################################################
# Voyagr – Self-hosted Supabase setup script
# Run this on your VPS (Contabo) as root or with sudo.
############################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo " Voyagr Self-Hosted Supabase Setup"
echo "========================================"

# ── 1. Check Docker ─────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "[1/6] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
else
    echo "[1/6] Docker already installed: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
    echo "[1/6] Installing Docker Compose plugin..."
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi

# ── 2. Generate secrets if .env doesn't exist ───────────────────────────
if [ ! -f .env ]; then
    echo "[2/6] Generating .env with random secrets..."
    POSTGRES_PW=$(openssl rand -hex 24)
    JWT_SEC=$(openssl rand -hex 32)

    # Detect public IP for API_EXTERNAL_URL
    DETECTED_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")

    cp .env.example .env
    sed -i "s|your-super-secret-postgres-password|${POSTGRES_PW}|" .env
    sed -i "s|your-super-secret-jwt-secret-at-least-32-characters-long|${JWT_SEC}|" .env
    sed -i "s|YOUR_SUPABASE_VPS_IP|${DETECTED_IP}|" .env

    echo ""
    echo "  IMPORTANT: Your generated secrets are in .env"
    echo "  JWT_SECRET=${JWT_SEC}"
    echo "  POSTGRES_PASSWORD=${POSTGRES_PW}"
    echo ""
    echo "  Save these somewhere safe!"
    echo ""
else
    echo "[2/6] .env already exists, skipping secret generation"
fi

# Source the .env to get JWT_SECRET for key generation
set -a; source .env; set +a

# ── 3. Generate anon and service_role JWTs ──────────────────────────────
echo "[3/6] Generating API keys (anon + service_role JWTs)..."

generate_jwt() {
    local role=$1
    local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
    local now=$(date +%s)
    local exp=$((now + 10 * 365 * 24 * 3600))
    local payload=$(echo -n "{\"role\":\"${role}\",\"iss\":\"supabase\",\"iat\":${now},\"exp\":${exp}}" | base64 -w0 | tr '+/' '-_' | tr -d '=')
    local sig=$(echo -n "${header}.${payload}" | openssl dgst -sha256 -hmac "${JWT_SECRET}" -binary | base64 -w0 | tr '+/' '-_' | tr -d '=')
    echo "${header}.${payload}.${sig}"
}

ANON_KEY=$(generate_jwt "anon")
SERVICE_KEY=$(generate_jwt "service_role")

echo "  ANON_KEY=${ANON_KEY}"
echo "  SERVICE_ROLE_KEY=${SERVICE_KEY}"

# Save keys to a reference file
cat > generated-keys.txt <<KEYSEOF
# Generated Supabase API keys ($(date))
# Keep this file safe and do NOT commit to git.

ANON_KEY=${ANON_KEY}
SERVICE_ROLE_KEY=${SERVICE_KEY}
JWT_SECRET=${JWT_SECRET}

# Set these in your Voyagr app .env:
SUPABASE_URL=https://vibevoyagr.duckdns.org/supabase
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_JWT_SECRET=${JWT_SECRET}
KEYSEOF

echo "  Keys saved to generated-keys.txt"

# ── 4. Pull and start containers ────────────────────────────────────────
echo "[4/6] Pulling Docker images (this may take a few minutes)..."
docker compose pull

echo "[5/6] Starting Supabase stack..."
docker compose up -d

echo "  Waiting for services to become healthy..."
sleep 10

# Check health
if docker compose ps | grep -q "running"; then
    echo "  All services are running!"
else
    echo "  WARNING: Some services may not have started. Check with: docker compose ps"
fi

# ── 5. Get this server's public IP ──────────────────────────────────────
echo "[6/6] Detecting public IP..."
PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "UNKNOWN")

echo ""
echo "========================================"
echo " Setup complete!"
echo "========================================"
echo ""
echo " This server's public IP: ${PUBLIC_IP}"
echo " Supabase API is running on: http://${PUBLIC_IP}:8000"
echo ""
echo " ── On your MAIN Voyagr VPS (not this server) ──"
echo ""
echo " 1. Edit /opt/voyagr/.env and set:"
echo "    SUPABASE_URL=http://${PUBLIC_IP}:8000"
echo "    SUPABASE_ANON_KEY=${ANON_KEY}"
echo "    SUPABASE_JWT_SECRET=${JWT_SECRET}"
echo ""
echo " 2. Restart Voyagr:"
echo "    systemctl restart voyagr"
echo ""
echo " 3. Test from anywhere:"
echo "    curl http://${PUBLIC_IP}:8000/auth/v1/health"
echo ""
echo " ── Optional: HTTPS with a domain name ──"
echo " If you point a domain at this IP and add Nginx + certbot,"
echo " change API_EXTERNAL_URL in .env and SUPABASE_URL in Voyagr's .env"
echo " to https://yourdomain.com"
echo ""
