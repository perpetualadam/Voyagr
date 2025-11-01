# Valhalla Nginx Reverse Proxy Configuration

**Complete Nginx setup for Valhalla with HTTPS, caching, and load balancing**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Basic Reverse Proxy](#basic-reverse-proxy)
2. [HTTPS Configuration](#https-configuration)
3. [Caching](#caching)
4. [Load Balancing](#load-balancing)
5. [Rate Limiting](#rate-limiting)
6. [Security](#security)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)

---

## 1. BASIC REVERSE PROXY

### Simple Proxy Configuration

**File**: `nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Upstream Valhalla server
    upstream valhalla_backend {
        server valhalla:8002;
    }

    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name _;
        
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL certificates
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Proxy settings
        location / {
            proxy_pass http://valhalla_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }
}
```

### Testing Configuration

```bash
# Validate nginx configuration
nginx -t

# Reload nginx
nginx -s reload

# Test proxy
curl -X POST http://localhost/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 51.5165, "lon": -0.0945}
    ],
    "costing": "auto"
  }'
```

---

## 2. HTTPS CONFIGURATION

### SSL Certificate Generation

**Using Let's Encrypt (Recommended)**:
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificate location
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

**Self-Signed Certificate** (Development):
```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/key.pem \
  -out /etc/nginx/ssl/cert.pem

# Verify certificate
openssl x509 -in /etc/nginx/ssl/cert.pem -text -noout
```

### SSL Configuration

```nginx
# Strong SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Auto-renewal (cron job)
# Add to crontab: 0 12 * * * /usr/bin/certbot renew --quiet
```

---

## 3. CACHING

### Response Caching

```nginx
# Cache configuration
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=valhalla_cache:10m max_size=1g inactive=60m;

server {
    location /route {
        proxy_cache valhalla_cache;
        proxy_cache_valid 200 1h;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        
        # Cache status header
        add_header X-Cache-Status $upstream_cache_status;
        
        proxy_pass http://valhalla_backend;
    }

    location /locate {
        proxy_cache valhalla_cache;
        proxy_cache_valid 200 24h;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        
        proxy_pass http://valhalla_backend;
    }

    # Don't cache matrix requests (too variable)
    location /matrix {
        proxy_pass http://valhalla_backend;
    }
}
```

### Cache Purging

```nginx
# Allow cache purging from localhost
map $request_method $skip_cache {
    default 1;
    GET 0;
}

location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge valhalla_cache "$scheme$request_method$host$1";
}
```

---

## 4. LOAD BALANCING

### Multiple Backend Servers

```nginx
upstream valhalla_backend {
    least_conn;  # Load balancing method
    
    server valhalla-1:8002 weight=1;
    server valhalla-2:8002 weight=1;
    server valhalla-3:8002 weight=1;
    
    # Health check
    check interval=3000 rise=2 fall=5 timeout=1000 type=http;
    check_http_send "GET /status HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
}

server {
    location / {
        proxy_pass http://valhalla_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Load Balancing Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `round_robin` | Default, rotate servers | General |
| `least_conn` | Least connections | Long requests |
| `ip_hash` | Client IP based | Session persistence |
| `least_time` | Fastest response | Performance |

---

## 5. RATE LIMITING

### Basic Rate Limiting

```nginx
# Define rate limit zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=route_limit:10m rate=5r/s;

server {
    # General API limit
    location / {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://valhalla_backend;
    }

    # Stricter limit for route requests
    location /route {
        limit_req zone=route_limit burst=10 nodelay;
        proxy_pass http://valhalla_backend;
    }

    # No limit for status
    location /status {
        proxy_pass http://valhalla_backend;
    }
}
```

### Advanced Rate Limiting

```nginx
# Rate limit by API key
map $http_x_api_key $api_client_id {
    default $binary_remote_addr;
    "~^(?P<token>.+)$" $token;
}

limit_req_zone $api_client_id zone=api_key_limit:10m rate=100r/s;

server {
    location / {
        limit_req zone=api_key_limit burst=50 nodelay;
        proxy_pass http://valhalla_backend;
    }
}
```

---

## 6. SECURITY

### Security Headers

```nginx
server {
    # Prevent clickjacking
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Prevent MIME type sniffing
    add_header X-Content-Type-Options "nosniff" always;

    # Enable XSS protection
    add_header X-XSS-Protection "1; mode=block" always;

    # Referrer policy
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'" always;

    # CORS headers (if needed)
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
}
```

### IP Whitelisting

```nginx
# Allow specific IPs
geo $ip_whitelist {
    default 0;
    192.168.1.0/24 1;
    10.0.0.0/8 1;
}

server {
    location / {
        if ($ip_whitelist = 0) {
            return 403;
        }
        proxy_pass http://valhalla_backend;
    }
}
```

### Request Size Limits

```nginx
server {
    client_max_body_size 10m;
    
    location /route {
        client_max_body_size 5m;
        proxy_pass http://valhalla_backend;
    }
}
```

---

## 7. MONITORING

### Access Logging

```nginx
log_format valhalla '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

access_log /var/log/nginx/valhalla_access.log valhalla;
```

### Metrics Endpoint

```nginx
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

---

## 8. TROUBLESHOOTING

### Common Issues

**502 Bad Gateway**:
```bash
# Check backend status
curl http://valhalla:8002/status

# Check nginx logs
tail -f /var/log/nginx/error.log
```

**Slow Responses**:
```bash
# Check upstream response time
grep "urt=" /var/log/nginx/valhalla_access.log | tail -20

# Check cache hit rate
grep "X-Cache-Status" /var/log/nginx/valhalla_access.log | sort | uniq -c
```

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_DOCKER_COMPOSE.md** - Docker setup

---

**Status**: ✅ Complete

---

**End of Valhalla Nginx Configuration**

