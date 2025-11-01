# Valhalla Production Deployment Guide

**Complete guide for deploying Valhalla to production**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Hosting Options](#hosting-options)
2. [Server Setup](#server-setup)
3. [Docker Deployment](#docker-deployment)
4. [Monitoring](#monitoring)
5. [Backup & Recovery](#backup--recovery)
6. [Security](#security)
7. [Scaling](#scaling)
8. [Cost Optimization](#cost-optimization)

---

## 1. HOSTING OPTIONS

### Cloud Providers

| Provider | Specs | Cost/Month | Best For |
|----------|-------|-----------|----------|
| **AWS EC2** | 4 vCPU, 16GB RAM | $100-200 | Enterprise |
| **DigitalOcean** | 4 vCPU, 16GB RAM | $80-120 | Startups |
| **Linode** | 4 vCPU, 16GB RAM | $80-120 | Developers |
| **Vultr** | 4 vCPU, 16GB RAM | $60-100 | Budget |
| **Hetzner** | 4 vCPU, 16GB RAM | $40-80 | Cost-effective |

### Recommended Configuration

**For UK + EU Routing**:
- **CPU**: 4+ cores
- **RAM**: 16-32 GB
- **Storage**: 100-200 GB SSD
- **Bandwidth**: 10 Mbps+
- **OS**: Ubuntu 20.04 LTS

---

## 2. SERVER SETUP

### Initial Setup

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io docker-compose

# Add user to docker group
sudo usermod -aG docker $USER

# Create application directory
mkdir -p ~/valhalla-voyagr
cd ~/valhalla-voyagr

# Create directory structure
mkdir -p data/{tiles,osm,logs,backups}
mkdir -p ssl
mkdir -p scripts
```

### Firewall Configuration

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verify rules
sudo ufw status
```

### SSL Certificate Setup

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Create symlink
sudo ln -s /etc/letsencrypt/live/your-domain.com/fullchain.pem ~/valhalla-voyagr/ssl/cert.pem
sudo ln -s /etc/letsencrypt/live/your-domain.com/privkey.pem ~/valhalla-voyagr/ssl/key.pem

# Auto-renewal
sudo systemctl enable certbot.timer
```

---

## 3. DOCKER DEPLOYMENT

### Production docker-compose.yml

```yaml
version: '3.8'

services:
  valhalla:
    image: gisops/valhalla:latest
    container_name: valhalla-server
    restart: always
    ports:
      - "127.0.0.1:8002:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
      - ./data/logs:/var/log/valhalla
    environment:
      - VALHALLA_TILE_DIR=/data/valhalla/tiles
      - VALHALLA_THREADS=4
      - VALHALLA_MEMORY_CACHE_SIZE=2048
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - valhalla-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

  nginx:
    image: nginx:alpine
    container_name: valhalla-proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./data/logs/nginx:/var/log/nginx
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - valhalla
    networks:
      - valhalla-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: always
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./data/prometheus:/prometheus
    networks:
      - valhalla-network

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./data/grafana:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    networks:
      - valhalla-network

networks:
  valhalla-network:
    driver: bridge
```

### Deployment Commands

```bash
# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f valhalla

# Stop services
docker-compose down
```

---

## 4. MONITORING

### Prometheus Configuration

**File**: `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'valhalla'
    static_configs:
      - targets: ['localhost:8002']
    metrics_path: '/metrics'

  - job_name: 'nginx'
    static_configs:
      - targets: ['localhost:9113']
```

### Health Checks

```bash
# Check Valhalla status
curl http://localhost:8002/status

# Check Prometheus
curl http://localhost:9090/api/v1/targets

# Check Grafana
curl http://localhost:3000/api/health
```

### Alerting

```yaml
# prometheus-alerts.yml
groups:
  - name: valhalla
    rules:
      - alert: ValhalllaDown
        expr: up{job="valhalla"} == 0
        for: 5m
        annotations:
          summary: "Valhalla server is down"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes{name="valhalla-server"} > 30000000000
        for: 5m
        annotations:
          summary: "Valhalla memory usage is high"
```

---

## 5. BACKUP & RECOVERY

### Backup Strategy

```bash
#!/bin/bash
# backup-valhalla.sh

BACKUP_DIR="./data/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup tiles
tar -czf $BACKUP_DIR/tiles_$DATE.tar.gz ./data/tiles/

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz \
  valhalla.json nginx.conf prometheus.yml

# Backup database
docker-compose exec -T valhalla \
  tar -czf /data/backups/db_$DATE.tar.gz /data/valhalla/

# Keep only last 7 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Automated Backups

```bash
# Add to crontab
# Daily backup at 2 AM
0 2 * * * cd ~/valhalla-voyagr && ./scripts/backup-valhalla.sh
```

### Recovery

```bash
# Restore tiles
tar -xzf data/backups/tiles_20251024_020000.tar.gz

# Restart services
docker-compose restart valhalla
```

---

## 6. SECURITY

### API Key Authentication

```nginx
# nginx.conf
map $http_x_api_key $api_key_valid {
    default 0;
    "your-secret-key-here" 1;
}

server {
    location /route {
        if ($api_key_valid = 0) {
            return 401;
        }
        proxy_pass http://valhalla:8002;
    }
}
```

### Rate Limiting

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

server {
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://valhalla:8002;
    }
}
```

### DDoS Protection

```bash
# Install fail2ban
sudo apt-get install -y fail2ban

# Configure for nginx
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
```

---

## 7. SCALING

### Horizontal Scaling

```yaml
# Multiple Valhalla instances
services:
  valhalla-1:
    image: gisops/valhalla:latest
    ports:
      - "8002:8002"
    volumes:
      - ./data/tiles:/data/valhalla/tiles:ro

  valhalla-2:
    image: gisops/valhalla:latest
    ports:
      - "8003:8002"
    volumes:
      - ./data/tiles:/data/valhalla/tiles:ro

  nginx:
    # Load balance between instances
    upstream valhalla_backend {
        server valhalla-1:8002;
        server valhalla-2:8002;
    }
```

### Vertical Scaling

```bash
# Increase resources in docker-compose.yml
environment:
  - VALHALLA_THREADS=8
  - VALHALLA_MEMORY_CACHE_SIZE=4096
```

---

## 8. COST OPTIMIZATION

### Storage Optimization

```bash
# Use compressed tiles
tar -czf tiles.tar.gz ./data/tiles/

# Use S3 for backups
aws s3 sync ./data/backups s3://my-bucket/valhalla-backups/
```

### Compute Optimization

```bash
# Use spot instances (AWS)
# Use reserved instances for long-term
# Use auto-scaling for variable load
```

### Bandwidth Optimization

```bash
# Enable caching
# Use CDN for static content
# Compress responses
```

---

## 📊 DEPLOYMENT CHECKLIST

- [ ] Server provisioned and configured
- [ ] Firewall rules configured
- [ ] SSL certificate installed
- [ ] Docker and docker-compose installed
- [ ] Valhalla tiles downloaded and built
- [ ] docker-compose.yml configured
- [ ] Nginx reverse proxy configured
- [ ] Monitoring setup (Prometheus/Grafana)
- [ ] Backup strategy implemented
- [ ] Security hardened
- [ ] Load testing completed
- [ ] Documentation updated

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_DOCKER_COMPOSE.md** - Docker setup
- **VALHALLA_NGINX_CONFIG.md** - Nginx configuration
- **VALHALLA_MONITORING.md** - Monitoring setup

---

**Status**: ✅ Complete

---

**End of Valhalla Production Deployment Guide**

