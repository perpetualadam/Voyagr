# Valhalla Complete Self-Hosting Guide for Voyagr

**Comprehensive walkthrough for implementing and self-hosting Valhalla routing engine**

**Version**: 1.0.0  
**Last Updated**: October 2025  
**Total Documentation**: 7 guides, 2100+ lines

---

## 🎯 EXECUTIVE SUMMARY

This comprehensive guide provides everything needed to self-host the Valhalla routing engine for the Voyagr satellite navigation application.

**What You'll Learn**:
- ✅ How to install Valhalla (Docker, Linux, macOS, Windows)
- ✅ How to download and process OpenStreetMap data
- ✅ How to build optimized routing tiles
- ✅ How to configure Valhalla for optimal performance
- ✅ How to deploy with Docker and Docker Compose
- ✅ How to set up Nginx reverse proxy with HTTPS
- ✅ How to integrate with Voyagr application
- ✅ How to deploy to production (AWS, DigitalOcean, etc.)
- ✅ How to monitor and optimize performance
- ✅ How to scale for high traffic

---

## 📚 DOCUMENTATION SUITE

### 7 Comprehensive Guides

1. **VALHALLA_SELF_HOSTING_GUIDE.md** (300 lines)
   - System requirements and installation methods
   - Map data acquisition and processing
   - Tile building process
   - Configuration overview
   - Running Valhalla server
   - Integration with Voyagr
   - Production deployment overview

2. **VALHALLA_CONFIG_DETAILED.md** (300 lines)
   - Complete valhalla.json reference
   - Mjolnir section (tile management)
   - HTTPD section (HTTP server)
   - Service section (API limits)
   - Costing options (auto, pedestrian, bicycle)
   - Logging configuration
   - Performance tuning parameters

3. **VALHALLA_DOCKER_COMPOSE.md** (300 lines)
   - Docker installation (all OS)
   - Docker Compose setup
   - Building custom images
   - Running containers
   - Volume management
   - Networking
   - Scaling strategies

4. **VALHALLA_NGINX_CONFIG.md** (300 lines)
   - Basic reverse proxy setup
   - HTTPS configuration
   - SSL certificate generation
   - Caching strategies
   - Load balancing
   - Rate limiting
   - Security headers

5. **VALHALLA_VOYAGR_INTEGRATION.md** (300 lines)
   - Current integration status
   - Configuration setup
   - API requests (route, matrix, locate)
   - Error handling and retry logic
   - Testing strategies
   - Performance optimization

6. **VALHALLA_PRODUCTION_DEPLOYMENT.md** (300 lines)
   - Hosting options comparison
   - Server setup and configuration
   - Firewall configuration
   - SSL certificate setup
   - Monitoring (Prometheus, Grafana)
   - Backup and recovery
   - Security hardening
   - Scaling strategies

7. **VALHALLA_PERFORMANCE_TUNING.md** (300 lines)
   - Benchmarking and load testing
   - Tile optimization
   - Memory management
   - Caching strategies
   - Load balancing
   - Database optimization
   - Network optimization
   - Performance monitoring

---

## 🚀 QUICK START (30 MINUTES)

### Development Setup

```bash
# 1. Install Docker
# Download from https://www.docker.com/products/docker-desktop

# 2. Create project directory
mkdir -p ~/valhalla-voyagr
cd ~/valhalla-voyagr

# 3. Create docker-compose.yml
# See VALHALLA_DOCKER_COMPOSE.md

# 4. Download UK tiles
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# 5. Build tiles
docker run -v $(pwd):/data gisops/valhalla:latest \
  valhalla_build_tiles -c /data/valhalla.json /data/great-britain-latest.osm.pbf

# 6. Start Valhalla
docker-compose up -d

# 7. Test
curl http://localhost:8002/status
```

---

## 📊 SYSTEM REQUIREMENTS

### Minimum (UK Only)

- **CPU**: 2 cores
- **RAM**: 8 GB
- **Storage**: 50 GB
- **Network**: 1 Mbps

### Recommended (UK + EU)

- **CPU**: 4+ cores
- **RAM**: 16+ GB
- **Storage**: 150 GB SSD
- **Network**: 10+ Mbps

### Production (High Traffic)

- **CPU**: 8+ cores
- **RAM**: 32+ GB
- **Storage**: 200+ GB SSD
- **Network**: 100+ Mbps

---

## 🗺️ MAP DATA SOURCES

### Primary Sources

1. **Geofabrik** (Recommended)
   - URL: https://download.geofabrik.de/
   - Coverage: Continents, countries, regions
   - Update: Daily
   - Format: PBF

2. **Planet.osm**
   - URL: https://planet.openstreetmap.org/
   - Coverage: Entire world
   - Format: PBF or XML

3. **BBBike**
   - URL: https://extract.bbbike.org/
   - Coverage: Custom extracts
   - Format: PBF, Shapefile, GeoJSON

### Download Examples

```bash
# UK
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# Europe
wget https://download.geofabrik.de/europe-latest.osm.pbf

# Multiple regions
wget https://download.geofabrik.de/europe/{great-britain,france,germany,spain,italy}-latest.osm.pbf
```

---

## 🔧 INSTALLATION METHODS

### Method 1: Docker (Recommended)

**Advantages**: Easy, works on all OS, isolated environment

```bash
docker pull gisops/valhalla:latest
docker-compose up -d
```

### Method 2: Linux Native

**Advantages**: Direct control, no container overhead

```bash
git clone https://github.com/valhalla/valhalla.git
cd valhalla && mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc) && sudo make install
```

### Method 3: macOS

**Advantages**: Native performance

```bash
brew install cmake boost protobuf curl geos proj sqlite3
# Then follow Linux native steps
```

### Method 4: Windows

**Recommended**: Use Docker Desktop

---

## 🏗️ TILE BUILDING

### Basic Process

```bash
# 1. Download OSM data
wget https://download.geofabrik.de/europe/great-britain-latest.osm.pbf

# 2. Build tiles
valhalla_build_tiles -c valhalla.json great-britain-latest.osm.pbf

# 3. Verify tiles
ls -la ./tiles/
find ./tiles -name "*.gph" | wc -l
```

### Time Estimates

| Region | Size | Build Time | RAM |
|--------|------|-----------|-----|
| UK | 8-12 GB | 30-60 min | 8 GB |
| Europe | 40-60 GB | 2-4 hours | 16 GB |
| UK + EU | 50-80 GB | 3-5 hours | 16-32 GB |

---

## ⚙️ CONFIGURATION

### Key Configuration Areas

1. **Mjolnir** - Tile management
2. **HTTPD** - HTTP server settings
3. **Service** - API limits
4. **Costing Options** - Routing models
5. **Logging** - Debug output

### Example Configuration

```json
{
  "mjolnir": {
    "tile_dir": "./tiles",
    "tile_extract": "./tiles/tiles.tar"
  },
  "httpd": {
    "base_url": "0.0.0.0:8002",
    "threads": 4
  },
  "service": {
    "max_locations": 20,
    "max_matrix_distance": 200000
  },
  "costing_options": {
    "auto": { "use_toll": true },
    "pedestrian": { "use_ferry": true },
    "bicycle": { "use_bike_lanes": true }
  }
}
```

---

## 🐳 DOCKER DEPLOYMENT

### Basic docker-compose.yml

```yaml
version: '3.8'
services:
  valhalla:
    image: gisops/valhalla:latest
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
    restart: unless-stopped
```

### Production docker-compose.yml

Includes:
- Valhalla server
- Nginx reverse proxy
- Prometheus monitoring
- Grafana dashboards

See: VALHALLA_DOCKER_COMPOSE.md

---

## 🔒 HTTPS & REVERSE PROXY

### Nginx Configuration

```nginx
upstream valhalla_backend {
    server valhalla:8002;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    location / {
        proxy_pass http://valhalla_backend;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### SSL Certificate

```bash
# Let's Encrypt
sudo certbot certonly --standalone -d your-domain.com

# Self-signed (development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem
```

---

## 🔌 VOYAGR INTEGRATION

### Configuration

```python
# satnav.py
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
VALHALLA_TIMEOUT = 30
VALHALLA_RETRIES = 3
```

### API Request

```python
def calculate_route(self, start_lat, start_lon, end_lat, end_lon):
    payload = {
        "locations": [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon}
        ],
        "costing": self.get_valhalla_costing()
    }
    
    response = requests.post(
        f"{self.valhalla_url}/route",
        json=payload,
        timeout=self.valhalla_timeout
    )
    
    return response.json() if response.status_code == 200 else None
```

---

## 🚀 PRODUCTION DEPLOYMENT

### Hosting Options

| Provider | Cost | Best For |
|----------|------|----------|
| AWS EC2 | $100-200/mo | Enterprise |
| DigitalOcean | $80-120/mo | Startups |
| Linode | $80-120/mo | Developers |
| Vultr | $60-100/mo | Budget |
| Hetzner | $40-80/mo | Cost-effective |

### Deployment Steps

1. Provision server (4 vCPU, 16GB RAM, 150GB SSD)
2. Install Docker and docker-compose
3. Download OSM data
4. Build tiles
5. Configure valhalla.json
6. Set up Nginx reverse proxy
7. Install SSL certificate
8. Start services
9. Configure monitoring
10. Set up backups

---

## 📊 MONITORING & OPTIMIZATION

### Key Metrics

- **Response Time**: Target <200ms
- **Throughput**: Target >100 req/s
- **Cache Hit Rate**: Target >80%
- **CPU Usage**: Target <50%
- **Memory Usage**: Target <50%

### Monitoring Tools

- **Prometheus**: Metrics collection
- **Grafana**: Visualization
- **Nginx**: Access logs
- **Docker**: Container stats

---

## 📋 DEPLOYMENT CHECKLIST

- [ ] System requirements met
- [ ] Docker installed
- [ ] OSM data downloaded
- [ ] Tiles built
- [ ] valhalla.json configured
- [ ] docker-compose.yml created
- [ ] Nginx configured
- [ ] SSL certificate installed
- [ ] Services started
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Security hardened
- [ ] Performance tested
- [ ] Voyagr integrated
- [ ] Documentation updated

---

## 📚 DOCUMENTATION FILES

| File | Purpose | Lines |
|------|---------|-------|
| VALHALLA_SELF_HOSTING_GUIDE.md | Main guide | 300 |
| VALHALLA_CONFIG_DETAILED.md | Configuration | 300 |
| VALHALLA_DOCKER_COMPOSE.md | Docker setup | 300 |
| VALHALLA_NGINX_CONFIG.md | Reverse proxy | 300 |
| VALHALLA_VOYAGR_INTEGRATION.md | Integration | 300 |
| VALHALLA_PRODUCTION_DEPLOYMENT.md | Production | 300 |
| VALHALLA_PERFORMANCE_TUNING.md | Optimization | 300 |
| VALHALLA_DOCUMENTATION_INDEX.md | Index | 300 |

---

## 🎓 LEARNING PATH

### Beginner (4 hours)

1. Read VALHALLA_SELF_HOSTING_GUIDE.md
2. Install Docker
3. Download UK tiles
4. Build tiles locally
5. Start Valhalla server
6. Test with curl

### Intermediate (1 day)

1. Read VALHALLA_CONFIG_DETAILED.md
2. Customize configuration
3. Set up Nginx reverse proxy
4. Install SSL certificate
5. Integrate with Voyagr
6. Test routing requests

### Advanced (2-3 days)

1. Read VALHALLA_PRODUCTION_DEPLOYMENT.md
2. Provision production server
3. Deploy with docker-compose
4. Set up monitoring
5. Configure backups
6. Optimize performance
7. Load test

---

## 🔗 RELATED RESOURCES

### Official

- **Valhalla GitHub**: https://github.com/valhalla/valhalla
- **Valhalla Docs**: https://valhalla.readthedocs.io/
- **Valhalla API**: https://valhalla.readthedocs.io/en/latest/api/

### Voyagr

- **README_COMPREHENSIVE.md** - Voyagr overview
- **DEPLOYMENT_GUIDE.md** - Voyagr deployment
- **FEATURE_REFERENCE.md** - Voyagr features

---

## ✅ VERIFICATION

### Health Check

```bash
curl http://localhost:8002/status
```

### Sample Route

```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 51.5074, "lon": -0.1278},
      {"lat": 53.4808, "lon": -2.2426}
    ],
    "costing": "auto"
  }'
```

---

## 📞 SUPPORT

- **GitHub Issues**: Report bugs
- **Documentation**: See guides above
- **Community**: Stack Overflow (tag: valhalla-routing)

---

**Status**: ✅ Complete and Production-Ready

**Last Updated**: October 2025

---

**End of Valhalla Complete Guide**

