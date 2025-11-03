# GraphHopper Security & Firewall Setup

## 🎯 Overview

Secure your GraphHopper instance on Contabo VPS with firewall rules, API keys, and authentication.

---

## 🔐 Step 1: Firewall Configuration

### On Contabo VPS (SSH)

**Check current firewall status**:
```bash
sudo ufw status
```

**Enable firewall** (if not already enabled):
```bash
sudo ufw enable
```

**Allow GraphHopper port**:
```bash
sudo ufw allow 8989/tcp
```

**Allow SSH** (important!):
```bash
sudo ufw allow 22/tcp
```

**Verify rules**:
```bash
sudo ufw status numbered
```

**Expected output**:
```
Status: active

     To                         Action      From
     --                         ------      ----
22/tcp                         ALLOW       Anywhere
8989/tcp                       ALLOW       Anywhere
```

### Contabo Dashboard Firewall

1. **Login** to Contabo: https://my.contabo.com
2. **Navigate**: VPS > Your VPS > Firewall
3. **Add Rule**:
   - **Protocol**: TCP
   - **Port**: 8989
   - **Source**: Any (or specific IP for production)
4. **Save**

---

## 🔑 Step 2: API Key Management

### Option 1: Environment Variable (Recommended)

**On VPS**:
```bash
# SSH into VPS
ssh root@81.0.246.97

# Add to ~/.bashrc
echo 'export GRAPHHOPPER_API_KEY="your-secret-key-here"' >> ~/.bashrc

# Reload
source ~/.bashrc

# Verify
echo $GRAPHHOPPER_API_KEY
```

**On Local PC** (`.env` file):
```
GRAPHHOPPER_URL=http://81.0.246.97:8989
GRAPHHOPPER_API_KEY=your-secret-key-here
GRAPHHOPPER_CUSTOM_MODEL_ID=model_123
SCDB_API_KEY=your-scdb-key-here
```

### Option 2: Secure Config File

**Create on VPS**:
```bash
# Create config directory
mkdir -p /data/config

# Create secure config
cat > /data/config/graphhopper.json << 'EOF'
{
  "api_key": "your-secret-key-here",
  "api_url": "http://81.0.246.97:8989",
  "custom_model_id": "model_123",
  "timeout": 30,
  "retries": 3
}
EOF

# Restrict permissions (owner read-only)
chmod 600 /data/config/graphhopper.json

# Verify
ls -la /data/config/graphhopper.json
```

**Read in Python**:
```python
import json
import os

config_file = '/data/config/graphhopper.json'

if os.path.exists(config_file):
    with open(config_file, 'r') as f:
        config = json.load(f)
        api_key = config['api_key']
        api_url = config['api_url']
else:
    # Fallback to environment variables
    api_key = os.getenv('GRAPHHOPPER_API_KEY')
    api_url = os.getenv('GRAPHHOPPER_URL')
```

### Option 3: Docker Secrets (Production)

**Create secret**:
```bash
echo "your-secret-key-here" | docker secret create graphhopper_api_key -
```

**Use in Docker Compose**:
```yaml
services:
  graphhopper:
    image: graphhopper/graphhopper:latest
    secrets:
      - graphhopper_api_key
    environment:
      GRAPHHOPPER_API_KEY_FILE: /run/secrets/graphhopper_api_key
    volumes:
      - /data:/data
```

---

## 🛡️ Step 3: API Authentication

### Add API Key Validation to voyagr_web.py

```python
import os
from functools import wraps
from flask import request, jsonify

GRAPHHOPPER_API_KEY = os.getenv('GRAPHHOPPER_API_KEY', '')

def require_api_key(f):
    """Decorator to require API key for protected endpoints."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        if not api_key or api_key != GRAPHHOPPER_API_KEY:
            return jsonify({'error': 'Unauthorized'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

# Usage
@app.route('/api/route', methods=['POST'])
@require_api_key
def calculate_route():
    # ... existing code ...
    pass
```

### Client-Side Usage

**With API Key**:
```bash
curl -X POST "http://localhost:5000/api/route" \
  -H "X-API-Key: your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "start": "51.5074,-0.1278",
    "end": "53.4839,-2.2446"
  }'
```

---

## 🔒 Step 4: HTTPS/SSL Setup (Production)

### Using Let's Encrypt

**Install Certbot**:
```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

**Get Certificate**:
```bash
sudo certbot certonly --standalone -d your-domain.com
```

**Configure Nginx**:
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:8989;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Auto-Renew**:
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

---

## 📊 Step 5: Monitoring & Logging

### Check GraphHopper Logs

```bash
# View logs
docker logs graphhopper

# Follow logs
docker logs -f graphhopper

# Last 100 lines
docker logs --tail 100 graphhopper
```

### Monitor Port Usage

```bash
# Check if port 8989 is open
netstat -tlnp | grep 8989

# Or
ss -tlnp | grep 8989
```

### Test Connectivity

```bash
# From local PC
curl http://81.0.246.97:8989/status

# From VPS
curl http://localhost:8989/status
```

---

## 🧪 Testing Security

### Test 1: Firewall Rules
```bash
# From local PC
curl -v http://81.0.246.97:8989/status

# Should connect successfully
```

### Test 2: API Key Validation
```bash
# Without key (should fail)
curl -X POST "http://localhost:5000/api/route" \
  -H "Content-Type: application/json" \
  -d '{"start": "51.5074,-0.1278", "end": "53.4839,-2.2446"}'

# With key (should succeed)
curl -X POST "http://localhost:5000/api/route" \
  -H "X-API-Key: your-secret-key-here" \
  -H "Content-Type: application/json" \
  -d '{"start": "51.5074,-0.1278", "end": "53.4839,-2.2446"}'
```

### Test 3: Port Security
```bash
# Check open ports
sudo nmap -p 8989 81.0.246.97

# Should show: open
```

---

## 📋 Security Checklist

- [ ] Firewall enabled on VPS
- [ ] Port 8989 allowed in UFW
- [ ] Port 8989 allowed in Contabo dashboard
- [ ] SSH port (22) allowed
- [ ] API key generated and stored securely
- [ ] API key added to `.env` file
- [ ] API key validation implemented in voyagr_web.py
- [ ] HTTPS/SSL configured (production)
- [ ] Logs monitored
- [ ] Connectivity tested

---

## 🚨 Troubleshooting

### Issue: Connection Refused
```bash
# Check if GraphHopper is running
docker ps | grep graphhopper

# Check firewall
sudo ufw status
```

### Issue: Timeout
```bash
# Check network latency
ping 81.0.246.97

# Increase timeout in .env
GRAPHHOPPER_TIMEOUT=60
```

### Issue: API Key Not Working
```bash
# Verify key in .env
echo $GRAPHHOPPER_API_KEY

# Check header in request
curl -v -H "X-API-Key: $GRAPHHOPPER_API_KEY" http://localhost:5000/api/route
```

---

## 📝 Files to Update

1. ✅ `.env` - Add API keys
2. ✅ `voyagr_web.py` - Add API key validation
3. ✅ `/data/config/graphhopper.json` - Secure config (optional)
4. ✅ Firewall rules - Configure on VPS and Contabo

---

**Status**: ✅ Ready to implement

