# Valhalla Performance Tuning Guide

**Optimization strategies for high-performance Valhalla deployment**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Benchmarking](#benchmarking)
2. [Tile Optimization](#tile-optimization)
3. [Memory Management](#memory-management)
4. [Caching Strategies](#caching-strategies)
5. [Load Balancing](#load-balancing)
6. [Database Optimization](#database-optimization)
7. [Network Optimization](#network-optimization)
8. [Monitoring Performance](#monitoring-performance)

---

## 1. BENCHMARKING

### Baseline Performance

```bash
# Test single route request
time curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 53.4808, "lon": -2.2426}
    ],
    "costing": "auto"
  }'

# Expected: 100-500ms for UK route
```

### Load Testing

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test with 100 concurrent requests
ab -n 1000 -c 100 http://localhost:8002/status

# Test with POST requests
ab -n 1000 -c 100 -p route.json -T application/json http://localhost:8002/route
```

### Performance Metrics

| Metric | Target | Acceptable | Poor |
|--------|--------|-----------|------|
| **Response Time** | <200ms | <500ms | >1s |
| **Throughput** | >100 req/s | >50 req/s | <10 req/s |
| **CPU Usage** | <50% | <80% | >90% |
| **Memory Usage** | <50% | <80% | >90% |

---

## 2. TILE OPTIMIZATION

### Tile Size Analysis

```bash
# Check tile sizes
du -sh ./data/tiles/

# Find largest tiles
find ./data/tiles -name "*.gph" -exec du -h {} \; | sort -rh | head -20

# Analyze tile distribution
find ./data/tiles -name "*.gph" | wc -l
```

### Tile Compression

```bash
# Create compressed tile archive
tar -czf tiles.tar.gz ./data/tiles/

# Extract on demand
tar -xzf tiles.tar.gz -C ./data/

# Use sparse files
fallocate -l 100G ./data/tiles/sparse.img
```

### Tile Caching

```json
{
  "mjolnir": {
    "tile_dir": "./tiles",
    "tile_extract": "./tiles/tiles.tar",
    "cache_size": 1024,
    "max_cache_size": 2048
  }
}
```

---

## 3. MEMORY MANAGEMENT

### Memory Configuration

```bash
# Check available memory
free -h

# Monitor memory usage
watch -n 1 'free -h'

# Check Docker memory limits
docker stats valhalla
```

### Valhalla Memory Settings

```json
{
  "httpd": {
    "memory_cache_size": 2048
  },
  "mjolnir": {
    "cache_size": 1024
  }
}
```

### Docker Memory Limits

```yaml
services:
  valhalla:
    image: gisops/valhalla:latest
    mem_limit: 16g
    memswap_limit: 20g
    environment:
      - VALHALLA_MEMORY_CACHE_SIZE=8192
```

### Memory Optimization Tips

```bash
# Reduce cache size for low-memory systems
# Increase cache size for high-traffic systems
# Monitor memory leaks
# Use memory profiling tools
```

---

## 4. CACHING STRATEGIES

### HTTP Caching

```nginx
# Cache configuration
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=valhalla_cache:100m max_size=10g inactive=24h;

server {
    location /route {
        proxy_cache valhalla_cache;
        proxy_cache_valid 200 1h;
        proxy_cache_key "$scheme$request_method$host$request_uri$request_body";
        add_header X-Cache-Status $upstream_cache_status;
        proxy_pass http://valhalla:8002;
    }

    location /locate {
        proxy_cache valhalla_cache;
        proxy_cache_valid 200 24h;
        proxy_pass http://valhalla:8002;
    }
}
```

### Redis Caching

```python
import redis

class ValhallaCacheManager:
    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379)
    
    def get_cached_route(self, key):
        return self.redis_client.get(key)
    
    def cache_route(self, key, route, ttl=3600):
        self.redis_client.setex(key, ttl, json.dumps(route))
```

### Cache Invalidation

```bash
# Clear nginx cache
sudo rm -rf /var/cache/nginx/*

# Clear Redis cache
redis-cli FLUSHALL

# Selective cache purging
curl -X PURGE http://localhost/route
```

---

## 5. LOAD BALANCING

### Nginx Load Balancing

```nginx
upstream valhalla_backend {
    least_conn;
    
    server valhalla-1:8002 weight=1 max_fails=3 fail_timeout=30s;
    server valhalla-2:8002 weight=1 max_fails=3 fail_timeout=30s;
    server valhalla-3:8002 weight=1 max_fails=3 fail_timeout=30s;
    
    keepalive 32;
}

server {
    location / {
        proxy_pass http://valhalla_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

### Health Checks

```nginx
# Active health checks
check interval=3000 rise=2 fall=5 timeout=1000 type=http;
check_http_send "GET /status HTTP/1.0\r\n\r\n";
check_http_expect_alive http_2xx;
```

---

## 6. DATABASE OPTIMIZATION

### Tile Database Optimization

```bash
# Use SSD storage
# Enable TRIM
sudo fstrim -v /

# Monitor disk I/O
iostat -x 1

# Check disk usage
df -h
```

### Index Optimization

```bash
# Rebuild indexes
docker-compose exec valhalla valhalla_build_tiles -c valhalla.json --rebuild-indexes
```

---

## 7. NETWORK OPTIMIZATION

### Connection Pooling

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

session = requests.Session()
retry = Retry(connect=3, backoff_factor=0.5)
adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
session.mount('http://', adapter)
session.mount('https://', adapter)
```

### Compression

```nginx
gzip on;
gzip_types application/json;
gzip_min_length 1000;
gzip_comp_level 6;
```

### Keep-Alive

```nginx
keepalive_timeout 65;
keepalive_requests 100;
```

---

## 8. MONITORING PERFORMANCE

### Key Metrics

```bash
# Response time
grep "urt=" /var/log/nginx/valhalla_access.log | awk '{print $NF}' | sort -n | tail -20

# Cache hit rate
grep "X-Cache-Status" /var/log/nginx/valhalla_access.log | sort | uniq -c

# Error rate
grep "5[0-9][0-9]" /var/log/nginx/valhalla_access.log | wc -l

# Throughput
wc -l /var/log/nginx/valhalla_access.log
```

### Prometheus Queries

```promql
# Request rate
rate(http_requests_total[5m])

# Response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Cache hit rate
rate(nginx_cache_hits_total[5m]) / rate(nginx_cache_requests_total[5m])
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "title": "Valhalla Performance",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{"expr": "rate(http_requests_total[5m])"}]
      },
      {
        "title": "Response Time (p95)",
        "targets": [{"expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"}]
      },
      {
        "title": "Cache Hit Rate",
        "targets": [{"expr": "rate(nginx_cache_hits_total[5m]) / rate(nginx_cache_requests_total[5m])"}]
      }
    ]
  }
}
```

---

## 📊 PERFORMANCE TUNING CHECKLIST

- [ ] Baseline performance measured
- [ ] Load testing completed
- [ ] Tile optimization done
- [ ] Memory configured optimally
- [ ] Caching enabled
- [ ] Load balancing configured
- [ ] Database optimized
- [ ] Network optimized
- [ ] Monitoring in place
- [ ] Performance targets met

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_CONFIG_DETAILED.md** - Configuration reference
- **VALHALLA_PRODUCTION_DEPLOYMENT.md** - Deployment guide

---

**Status**: ✅ Complete

---

**End of Valhalla Performance Tuning Guide**

