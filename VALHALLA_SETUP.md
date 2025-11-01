# Valhalla Setup Guide for Voyagr

This guide explains how to set up Valhalla routing engine for the Voyagr sat nav application.

## Prerequisites

- Linux/Ubuntu system (or WSL on Windows)
- 8GB+ RAM
- 20GB+ disk space
- Build tools: gcc, g++, cmake, make

## Installation Steps

### 1. Install System Dependencies

```bash
sudo apt update
sudo apt install -y build-essential libcurl4-openssl-dev libprotobuf-dev \
  protobuf-compiler libboost-all-dev liblua5.3-dev libsqlite3-dev zlib1g-dev
```

### 2. Install Python Boost Interprocess

```bash
pip install py-boost-interprocess
```

### 3. Clone and Build Valhalla

```bash
git clone https://github.com/valhalla/valhalla.git
cd valhalla
```

### 4. Update CMakeLists.txt for Dynamic AutoCost

Add the dynamic_autocost.cc file to the build:

```bash
echo "set(SOURCE_FILES autocost.cc dynamic_autocost.cc \${SOURCE_FILES})" >> valhalla/sif/CMakeLists.txt
```

### 5. Build Valhalla

```bash
mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release 2> cmake_errors.log
make -j$(nproc) 2> make_errors.log
sudo make install
```

### 6. Download OSM Data

Download Great Britain OSM data:

```bash
wget -O great-britain-latest.osm.pbf https://download.geofabrik.de/europe/great-britain-latest.osm.pbf
```

### 7. Tag Cameras and Tolls

Create `tag_cameras.py` to add camera and toll tags:

```python
import osmium
import json

class CameraHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.cameras = []
        self.tolls = []
    
    def node(self, n):
        if 'highway' in n.tags:
            if n.tags['highway'] in ['speed_camera', 'traffic_signals']:
                if n.tags.get('camera') in ['yes', 'red_light', 'speed']:
                    self.cameras.append({
                        'lat': n.lat,
                        'lon': n.lon,
                        'type': n.tags['highway']
                    })
        
        if n.tags.get('toll') == 'yes':
            self.tolls.append({
                'lat': n.lat,
                'lon': n.lon,
                'name': n.tags.get('name', 'Toll')
            })
    
    def way(self, w):
        if w.tags.get('toll') == 'yes':
            self.tolls.append({
                'name': w.tags.get('name', 'Toll'),
                'toll': True
            })

handler = CameraHandler()
handler.apply_file('great-britain-latest.osm.pbf')

print(f"Found {len(handler.cameras)} cameras")
print(f"Found {len(handler.tolls)} tolls")
```

Run the tagger:

```bash
python tag_cameras.py
```

### 8. Build Valhalla Tiles

```bash
valhalla_build_tiles -c ../valhalla.json great-britain-latest.osm.pbf
```

This creates tiles in `./tiles/` directory.

### 9. Build Traffic Tiles (Optional)

If you have Open Traffic data:

```bash
[ -d ./open_traffic_spd_tiles/ ] && valhalla_build_traffic_tiles -c ../valhalla.json ./open_traffic_spd_tiles/
```

### 10. Start Valhalla Service

```bash
./valhalla_service ../valhalla.json 1 2> server_errors.log &
```

The service will start on `http://localhost:8002`

## Configuration

### valhalla.json Settings

Key settings for Voyagr:

```json
{
  "mjolnir": {
    "tile_dir": "./tiles",
    "tile_extract": "./tiles/tiles.tar"
  },
  "httpd": {
    "base_url": "0.0.0.0:8002"
  },
  "costing_options": {
    "dynamic_auto": {
      "toll_factor": 10.0,
      "avoid_toll_roads": false
    }
  }
}
```

### Toll Avoidance

To enable toll avoidance in routing:

```json
{
  "costing_options": {
    "dynamic_auto": {
      "toll_factor": 10.0,
      "avoid_toll_roads": true
    }
  }
}
```

## Testing

### Test Routing

```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 53.5526, "lon": -1.4797},
      {"lat": 51.5074, "lon": -0.1278}
    ],
    "costing": "auto",
    "costing_options": {
      "auto": {
        "toll_factor": 1.0
      }
    }
  }'
```

### Test Toll Avoidance

```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 53.5526, "lon": -1.4797},
      {"lat": 51.5074, "lon": -0.1278}
    ],
    "costing": "auto",
    "costing_options": {
      "auto": {
        "toll_factor": 10.0
      }
    }
  }'
```

## Troubleshooting

### Build Errors

Check logs:
```bash
cat cmake_errors.log
cat make_errors.log
```

### Service Won't Start

Check port 8002 is available:
```bash
lsof -i :8002
```

### Tiles Not Found

Verify tiles directory:
```bash
ls -la ./tiles/
```

### Memory Issues

Reduce tile building parallelism:
```bash
valhalla_build_tiles -c ../valhalla.json -j 2 great-britain-latest.osm.pbf
```

## Performance Tips

1. **Tile Extraction**: Extract tiles to tar for faster loading
2. **Traffic Data**: Use Open Traffic for real-time speeds
3. **Caching**: Enable HTTP caching for repeated routes
4. **Parallelism**: Use `-j` flag for multi-core building

## Integration with Voyagr

In `satnav.py`, configure Valhalla endpoint:

```python
VALHALLA_URL = "http://localhost:8002"

def get_route(start_lat, start_lon, end_lat, end_lon):
    response = requests.post(f"{VALHALLA_URL}/route", json={
        "locations": [
            {"lat": start_lat, "lon": start_lon},
            {"lat": end_lat, "lon": end_lon}
        ],
        "costing": "auto",
        "costing_options": {
            "auto": {
                "toll_factor": 10.0 if avoid_tolls else 1.0
            }
        }
    })
    return response.json()
```

## References

- [Valhalla Documentation](https://valhalla.readthedocs.io/)
- [Valhalla GitHub](https://github.com/valhalla/valhalla)
- [OpenStreetMap Data](https://www.openstreetmap.org/)
- [Geofabrik Downloads](https://download.geofabrik.de/)

