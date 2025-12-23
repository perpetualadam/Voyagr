#!/bin/bash
# Voyagr Contabo Deployment Script
# Run on Contabo server (81.0.246.97)

set -e

echo "=== Voyagr Contabo Deployment ==="

# Install dependencies
echo "[1/7] Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-pip python3-venv nginx git

# Create app directory
echo "[2/7] Creating application directory..."
mkdir -p /opt/voyagr
cd /opt/voyagr

# Clone or update repository
echo "[3/7] Cloning repository..."
if [ -d ".git" ]; then
    git pull origin main
else
    git clone https://github.com/perpetualadam/Voyagr.git .
fi

# Create virtual environment
echo "[4/7] Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-railway.txt

# Copy environment file
echo "[5/7] Configuring environment..."
cp .env.example .env 2>/dev/null || cp .env .env.backup
cat > .env << 'EOF'
VALHALLA_URL=http://localhost:8002
GRAPHHOPPER_URL=http://localhost:8989
GRAPHHOPPER_TIMEOUT=30
VALHALLA_TIMEOUT=30
USE_CUSTOM_ROUTER=false
EOF

# Setup systemd service
echo "[6/7] Installing systemd service..."
cp deploy/voyagr.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voyagr
systemctl restart voyagr

# Setup nginx
echo "[7/7] Configuring nginx..."
cp deploy/nginx-voyagr.conf /etc/nginx/sites-available/voyagr
ln -sf /etc/nginx/sites-available/voyagr /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "=== Deployment Complete ==="
echo "Voyagr is running at: http://81.0.246.97"
echo ""
echo "Commands:"
echo "  Status:  systemctl status voyagr"
echo "  Logs:    journalctl -u voyagr -f"
echo "  Restart: systemctl restart voyagr"
echo ""
echo "For HTTPS, run: certbot --nginx -d voyagr.perpetualadam.com"

