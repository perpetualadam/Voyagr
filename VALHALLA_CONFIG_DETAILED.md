# Valhalla Configuration Reference

**Detailed guide to valhalla.json configuration**

**Version**: 1.0.0  
**Last Updated**: October 2025

---

## 📋 TABLE OF CONTENTS

1. [Configuration Structure](#configuration-structure)
2. [Mjolnir Section](#mjolnir-section)
3. [HTTPD Section](#httpd-section)
4. [Service Section](#service-section)
5. [Costing Options](#costing-options)
6. [Logging Section](#logging-section)
7. [Performance Tuning](#performance-tuning)
8. [Example Configurations](#example-configurations)

---

## 1. CONFIGURATION STRUCTURE

**File Location**: `valhalla.json`

**Basic Structure**:
```json
{
  "mjolnir": { ... },
  "httpd": { ... },
  "service": { ... },
  "costing_options": { ... },
  "logging": { ... },
  "statsd": { ... }
}
```

---

## 2. MJOLNIR SECTION

**Purpose**: Tile management and data loading

### Parameters

```json
{
  "mjolnir": {
    "tile_dir": "./tiles",
    "tile_extract": "./tiles/tiles.tar",
    "traffic_extract": "./tiles/traffic_tiles.tar",
    "admin": "./admin.sqlite",
    "timezone": "./tz_world.sqlite",
    "logging": {
      "type": "std_out",
      "level": "debug"
    }
  }
}
```

### Parameter Explanation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tile_dir` | string | `./tiles` | Directory containing tile files |
| `tile_extract` | string | `./tiles/tiles.tar` | Compressed tile archive |
| `traffic_extract` | string | `./tiles/traffic_tiles.tar` | Traffic data archive |
| `admin` | string | `./admin.sqlite` | Admin boundary database |
| `timezone` | string | `./tz_world.sqlite` | Timezone database |

### Optimization Tips

```json
{
  "mjolnir": {
    "tile_dir": "/mnt/fast-ssd/tiles",
    "tile_extract": "/mnt/fast-ssd/tiles/tiles.tar",
    "logging": {
      "type": "std_out",
      "level": "info"
    }
  }
}
```

**Tips**:
- Use SSD for `tile_dir` for better performance
- Use separate disk for tiles if possible
- Set logging level to "info" in production

---

## 3. HTTPD SECTION

**Purpose**: HTTP server configuration

### Parameters

```json
{
  "httpd": {
    "service": [
      {
        "actions": ["route", "locate", "map_match"],
        "admin": false
      }
    ],
    "base_url": "0.0.0.0:8002",
    "listen": "0.0.0.0",
    "port": 8002,
    "threads": 4,
    "max_request_size": 10485760
  }
}
```

### Parameter Explanation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `base_url` | string | `0.0.0.0:8002` | Server address and port |
| `listen` | string | `0.0.0.0` | Listen address (0.0.0.0 = all interfaces) |
| `port` | int | `8002` | HTTP port |
| `threads` | int | `4` | Worker threads |
| `max_request_size` | int | `10485760` | Max request size (bytes) |

### Service Actions

| Action | Purpose | Example |
|--------|---------|---------|
| `route` | Calculate routes | `/route` endpoint |
| `locate` | Find nearest edge | `/locate` endpoint |
| `map_match` | Snap GPS trace to road | `/map_match` endpoint |
| `isochrone` | Calculate reachable area | `/isochrone` endpoint |
| `matrix` | Calculate distance matrix | `/matrix` endpoint |

### Production Configuration

```json
{
  "httpd": {
    "service": [
      {
        "actions": ["route", "locate", "map_match"],
        "admin": false
      }
    ],
    "base_url": "127.0.0.1:8002",
    "listen": "127.0.0.1",
    "port": 8002,
    "threads": 8,
    "max_request_size": 10485760
  }
}
```

**Tips**:
- Use `127.0.0.1` with reverse proxy in production
- Increase threads for high traffic (2x CPU cores)
- Disable admin endpoints in production

---

## 4. SERVICE SECTION

**Purpose**: API limits and constraints

### Parameters

```json
{
  "service": {
    "max_locations": 20,
    "max_matrix_distance": 200000,
    "max_matrix_locations": 50,
    "max_avoid_locations": 10,
    "max_reachability": 100,
    "max_alternates": 2,
    "max_exclude_edges": 50,
    "max_exclude_vertices": 50,
    "max_shape": 16000,
    "max_exclude_polygons": 1
  }
}
```

### Parameter Explanation

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_locations` | int | `20` | Max waypoints per route |
| `max_matrix_distance` | int | `200000` | Max distance for matrix (meters) |
| `max_matrix_locations` | int | `50` | Max locations for matrix |
| `max_avoid_locations` | int | `10` | Max avoid locations |
| `max_reachability` | int | `100` | Max reachability locations |
| `max_alternates` | int | `2` | Max alternate routes |
| `max_shape` | int | `16000` | Max shape points in response |

### Voyagr-Optimized Configuration

```json
{
  "service": {
    "max_locations": 5,
    "max_matrix_distance": 100000,
    "max_matrix_locations": 10,
    "max_avoid_locations": 5,
    "max_alternates": 1,
    "max_shape": 8000
  }
}
```

---

## 5. COSTING OPTIONS

**Purpose**: Routing model parameters

### Auto Costing (Car)

```json
{
  "costing_options": {
    "auto": {
      "maneuver_penalty": 5,
      "gate_penalty": 0,
      "toll_booth_penalty": 0,
      "toll_booth_factor": 1.0,
      "country_crossing_penalty": 0,
      "use_tracks": false,
      "allow_hov_2": false,
      "allow_hov_3": false,
      "allow_taxi": true,
      "living_street_factor": 0.6,
      "alley_factor": 0.6,
      "parking_difficulty_factor": 1.0,
      "use_ferry": true,
      "private_access_penalty": 450,
      "toll_factor": 1.0,
      "motorway_factor": 1.0,
      "link_factor": 1.0,
      "roundabout_factor": 1.0,
      "ferry_factor": 1.0,
      "unpaved_factor": 1.0,
      "cash_only_penalty": 0,
      "hazmat": false,
      "max_grade": 100,
      "max_hiking_difficulty": 0,
      "min_road_class": "motorway",
      "disable_toll_intersection": false
    }
  }
}
```

### Pedestrian Costing

```json
{
  "pedestrian": {
    "maneuver_penalty": 5,
    "gate_penalty": 0,
    "country_crossing_penalty": 0,
    "use_tracks": true,
    "allow_taxi": false,
    "living_street_factor": 0.6,
    "alley_factor": 0.6,
    "use_ferry": true,
    "private_access_penalty": 450,
    "toll_factor": 0.0,
    "motorway_factor": 0.0,
    "link_factor": 1.0,
    "roundabout_factor": 1.0,
    "ferry_factor": 1.0,
    "unpaved_factor": 1.0,
    "max_grade": 100,
    "max_hiking_difficulty": 0,
    "min_road_class": "living_street",
    "disable_toll_intersection": true
  }
}
```

### Bicycle Costing

```json
{
  "bicycle": {
    "maneuver_penalty": 5,
    "gate_penalty": 0,
    "country_crossing_penalty": 0,
    "use_tracks": true,
    "living_street_factor": 0.6,
    "alley_factor": 0.6,
    "use_ferry": true,
    "private_access_penalty": 450,
    "toll_factor": 0.0,
    "motorway_factor": 0.0,
    "link_factor": 1.0,
    "roundabout_factor": 1.0,
    "ferry_factor": 1.0,
    "unpaved_factor": 1.0,
    "max_grade": 100,
    "max_hiking_difficulty": 0,
    "min_road_class": "living_street",
    "disable_toll_intersection": true,
    "use_bike_lanes": true,
    "use_roads": true,
    "use_living_streets": true
  }
}
```

### Parameter Explanation

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `maneuver_penalty` | int | 0-100 | Penalty for turns |
| `toll_booth_penalty` | int | 0-500 | Penalty for toll booths |
| `toll_factor` | float | 0.0-10.0 | Multiplier for toll roads |
| `motorway_factor` | float | 0.0-10.0 | Multiplier for motorways |
| `living_street_factor` | float | 0.0-1.0 | Multiplier for living streets |
| `use_ferry` | bool | true/false | Allow ferry routes |
| `max_grade` | int | 0-100 | Max road grade (%) |
| `min_road_class` | string | See below | Minimum road class |

### Road Classes

```
motorway > trunk > primary > secondary > tertiary > 
unclassified > residential > service_other > living_street
```

---

## 6. LOGGING SECTION

**Purpose**: Debug and monitoring output

### Parameters

```json
{
  "logging": {
    "type": "std_out",
    "level": "info",
    "color": true
  }
}
```

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `debug` | Detailed debug info | Development |
| `info` | General information | Production |
| `warn` | Warnings | Production |
| `error` | Errors only | Production |

### Production Configuration

```json
{
  "logging": {
    "type": "std_out",
    "level": "info",
    "color": false
  }
}
```

---

## 7. PERFORMANCE TUNING

### High-Traffic Configuration

```json
{
  "httpd": {
    "threads": 16,
    "max_request_size": 20971520
  },
  "service": {
    "max_locations": 10,
    "max_matrix_locations": 100
  }
}
```

### Low-Resource Configuration

```json
{
  "httpd": {
    "threads": 2,
    "max_request_size": 5242880
  },
  "service": {
    "max_locations": 5,
    "max_matrix_locations": 25
  }
}
```

---

## 8. EXAMPLE CONFIGURATIONS

### Development Configuration

See VALHALLA_CONFIG_EXAMPLES.md

---

## 📚 RELATED DOCUMENTATION

- **VALHALLA_SELF_HOSTING_GUIDE.md** - Main guide
- **VALHALLA_CONFIG_EXAMPLES.md** - Example configurations
- **VALHALLA_DOCKER_COMPOSE.md** - Docker setup

---

**Status**: ✅ Complete

---

**End of Valhalla Configuration Reference**

