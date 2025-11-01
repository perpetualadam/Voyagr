# Valhalla Docker Deployment Guide

**Complete Docker and Docker Compose setup for Valhalla**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Docker Installation](#docker-installation)
2. [Docker Compose Setup](#docker-compose-setup)
3. [Building Docker Image](#building-docker-image)
4. [Running Containers](#running-containers)
5. [Volume Management](#volume-management)
6. [Networking](#networking)
7. [Scaling](#scaling)
8. [Troubleshooting](#troubleshooting)

---

## 1. DOCKER INSTALLATION

### Windows/macOS

```bash
# Download Docker Desktop
# https://www.docker.com/products/docker-desktop

# Verify installation
docker --version
docker-compose --version
```

### Linux (Ubuntu/Debian)

```bash
# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker-compose --version
```

### Linux (CentOS/RHEL)

```bash
# Install Docker
sudo yum install -y docker docker-compose

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group
sudo usermod -aG docker $USER
```

---

## 2. DOCKER COMPOSE SETUP

### Project Structure

```
valhalla-voyagr/
├── docker-compose.yml
├── valhalla.json
├── nginx.conf
├── data/
│   ├── tiles/
│   ├── osm/
│   └── logs/
└── scripts/
    ├── build-tiles.sh
    ├── download-osm.sh
    └── health-check.sh
```

### Basic docker-compose.yml

```yaml
version: '3.8'

services:
  valhalla:
    image: gisops/valhalla:latest
    container_name: valhalla-server
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
      - ./data/logs:/var/log/valhalla
    environment:
      - VALHALLA_TILE_DIR=/data/valhalla/tiles
      - VALHALLA_THREADS=4
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - valhalla-network

  nginx:
    image: nginx:alpine
    container_name: valhalla-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./data/logs/nginx:/var/log/nginx
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - valhalla
    restart: unless-stopped
    networks:
      - valhalla-network

networks:
  valhalla-network:
    driver: bridge
```

### Production docker-compose.yml

```yaml
version: '3.8'

services:
  valhalla:
    image: gisops/valhalla:latest
    container_name: valhalla-server
    ports:
      - "127.0.0.1:8002:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
      - ./data/logs:/var/log/valhalla
    environment:
      - VALHALLA_TILE_DIR=/data/valhalla/tiles
      - VALHALLA_THREADS=8
      - VALHALLA_MEMORY_CACHE_SIZE=1024
    restart: always
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
        max-file: "3"

  nginx:
    image: nginx:alpine
    container_name: valhalla-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./data/logs/nginx:/var/log/nginx
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - valhalla
    restart: always
    networks:
      - valhalla-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./data/prometheus:/prometheus
    restart: unless-stopped
    networks:
      - valhalla-network

networks:
  valhalla-network:
    driver: bridge

volumes:
  valhalla-tiles:
  prometheus-data:
```

---

## 3. BUILDING DOCKER IMAGE

### Using Official Image

```bash
# Pull official Valhalla image
docker pull gisops/valhalla:latest

# Verify image
docker images | grep valhalla
```

### Building Custom Image

**Dockerfile**:
```dockerfile
FROM ubuntu:20.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential cmake git pkg-config \
    libcurl4-openssl-dev libprotobuf-dev \
    protobuf-compiler libboost-all-dev \
    libsqlite3-dev libgeos-dev libgeos++-dev \
    libproj-dev libtool jq curl

# Clone and build Valhalla
RUN git clone https://github.com/valhalla/valhalla.git /valhalla
WORKDIR /valhalla
RUN mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc) && \
    make install

# Create app user
RUN useradd -m -u 1000 valhalla

# Set working directory
WORKDIR /data/valhalla

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8002/status || exit 1

# Start Valhalla
CMD ["valhalla_service", "/etc/valhalla/valhalla.json"]
```

**Build Command**:
```bash
docker build -t valhalla-custom:latest .
```

---

## 4. RUNNING CONTAINERS

### Start Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f valhalla

# Check status
docker-compose ps
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### View Logs

```bash
# View Valhalla logs
docker-compose logs valhalla

# Follow logs in real-time
docker-compose logs -f valhalla

# View last 100 lines
docker-compose logs --tail=100 valhalla

# View logs with timestamps
docker-compose logs -t valhalla
```

### Execute Commands

```bash
# Access container shell
docker-compose exec valhalla bash

# Run command in container
docker-compose exec valhalla curl http://localhost:8002/status

# Check tile directory
docker-compose exec valhalla ls -la /data/valhalla/tiles
```

---

## 5. VOLUME MANAGEMENT

### Volume Types

**Bind Mounts** (Recommended for development):
```yaml
volumes:
  - ./data/tiles:/data/valhalla/tiles:ro
```

**Named Volumes** (Recommended for production):
```yaml
volumes:
  - valhalla-tiles:/data/valhalla/tiles:ro

volumes:
  valhalla-tiles:
    driver: local
```

### Backup Volumes

```bash
# Backup tiles volume
docker run --rm -v valhalla-tiles:/data \
  -v $(pwd):/backup \
  ubuntu tar czf /backup/tiles-backup.tar.gz -C /data .

# Restore tiles volume
docker run --rm -v valhalla-tiles:/data \
  -v $(pwd):/backup \
  ubuntu tar xzf /backup/tiles-backup.tar.gz -C /data
```

### Permissions

```bash
# Fix volume permissions
docker-compose exec valhalla chown -R valhalla:valhalla /data/valhalla

# Check permissions
docker-compose exec valhalla ls -la /data/valhalla
```

---

## 6. NETWORKING

### Port Mapping

```yaml
# Expose to all interfaces
ports:
  - "8002:8002"

# Expose to localhost only
ports:
  - "127.0.0.1:8002:8002"

# Expose to specific IP
ports:
  - "192.168.1.100:8002:8002"
```

### Network Communication

```bash
# Test connectivity between containers
docker-compose exec nginx curl http://valhalla:8002/status

# Check network
docker network ls
docker network inspect valhalla-voyagr_valhalla-network
```

---

## 7. SCALING

### Multiple Valhalla Instances

```yaml
version: '3.8'

services:
  valhalla-1:
    image: gisops/valhalla:latest
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
    networks:
      - valhalla-network

  valhalla-2:
    image: gisops/valhalla:latest
    ports:
      - "8003:8002"
    volumes:
      - ./valhalla.json:/etc/valhalla/valhalla.json:ro
      - ./data/tiles:/data/valhalla/tiles:ro
    networks:
      - valhalla-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - valhalla-1
      - valhalla-2
    networks:
      - valhalla-network

networks:
  valhalla-network:
    driver: bridge
```

---

## 8. TROUBLESHOOTING

### Container Won't Start

```bash
# Check logs
docker-compose logs valhalla

# Check image
docker images | grep valhalla

# Rebuild image
docker-compose build --no-cache valhalla
```

### Tiles Not Found

```bash
# Check volume mount
docker-compose exec valhalla ls -la /data/valhalla/tiles

# Check permissions
docker-compose exec valhalla stat /data/valhalla/tiles

# Rebuild tiles
docker-compose exec valhalla valhalla_build_tiles /etc/valhalla/valhalla.json
```

### High Memory Usage

```bash
# Check memory
docker stats valhalla

# Reduce cache size in valhalla.json
# Reduce threads in docker-compose.yml
```

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_CONFIG_DETAILED.md** - Configuration reference
- **VALHALLA_NGINX_CONFIG.md** - Nginx setup

---

**Status**: ✅ Complete

---

**End of Valhalla Docker Deployment Guide**

