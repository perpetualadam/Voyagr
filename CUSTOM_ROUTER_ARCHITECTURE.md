# Custom Routing Engine - Architecture & Design

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Voyagr PWA / App                         │
│                  (Flask / JavaScript)                       │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Routing API    │
                    │  /api/route     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼─────┐      ┌──────▼──────┐      ┌─────▼────┐
   │ GraphHop │      │   Custom    │      │ Valhalla │
   │   per    │      │   Router    │      │          │
   │ (Primary)│      │ (Phase 1)   │      │(Fallback)│
   └──────────┘      └──────┬──────┘      └──────────┘
                             │
                    ┌────────▼────────┐
                    │  Router Class   │
                    │  (Dijkstra)     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼──────┐      ┌─────▼─────┐      ┌──────▼────┐
   │   Graph   │      │  Instruc  │      │   Cost    │
   │ (RoadNet) │      │   tions   │      │Calculator │
   └────┬──────┘      └───────────┘      └───────────┘
        │
   ┌────▼──────────────────────────────┐
   │   SQLite Database                 │
   │  (nodes, edges, ways, restrictions)
   │   ~2GB UK data                    │
   └───────────────────────────────────┘
```

---

## Module Hierarchy

### Level 1: Data Layer
**`osm_parser.py`** - OSM Data Processing
- Downloads UK PBF file from Geofabrik
- Parses with osmium library
- Extracts nodes, ways, turn restrictions
- Creates SQLite database

### Level 2: Graph Layer
**`graph.py`** - Road Network Graph
- Loads data from SQLite
- Builds in-memory adjacency lists
- Provides neighbor lookups
- Calculates distances (Haversine)
- Snaps coordinates to nearest node

### Level 3: Routing Layer
**`dijkstra.py`** - Route Calculation
- Implements bidirectional Dijkstra
- Uses priority queue (heapq)
- Reconstructs paths
- Extracts route geometry
- Encodes polylines

### Level 4: Enhancement Layers
**`instructions.py`** - Turn Instructions
- Calculates bearings
- Detects maneuvers
- Generates human-readable instructions
- Extracts street names

**`costs.py`** - Cost Calculation
- Fuel cost (6 vehicle types)
- Toll cost estimation
- CAZ cost calculation
- Total cost breakdown

**`cache.py`** - Performance Caching
- LRU cache implementation
- TTL-based expiration
- Memory-efficient storage

---

## Data Flow

### Route Calculation Flow
```
User Input (lat1, lon1, lat2, lon2)
    │
    ├─→ Find nearest nodes (snap to road)
    │
    ├─→ Run Dijkstra algorithm
    │   ├─→ Forward search from start
    │   ├─→ Backward search from end
    │   └─→ Meet in the middle
    │
    ├─→ Reconstruct path (node IDs)
    │
    ├─→ Extract coordinates
    │
    ├─→ Encode polyline
    │
    ├─→ Calculate distance & time
    │
    └─→ Return route object
```

### Cost Calculation Flow
```
Route (distance_km, vehicle_type)
    │
    ├─→ Calculate fuel cost
    │   └─→ (distance / efficiency) * price
    │
    ├─→ Calculate toll cost
    │   └─→ distance * toll_rate
    │
    ├─→ Calculate CAZ cost
    │   └─→ (distance / 50) * caz_rate
    │
    └─→ Return cost breakdown
```

### Instruction Generation Flow
```
Path (list of node IDs)
    │
    ├─→ For each node pair:
    │   ├─→ Calculate bearing (prev → curr)
    │   ├─→ Calculate bearing (curr → next)
    │   ├─→ Detect maneuver (angle difference)
    │   ├─→ Get street name
    │   └─→ Generate instruction text
    │
    └─→ Return instruction list
```

---

## Database Schema

### Nodes Table
```sql
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    elevation REAL
);
CREATE INDEX idx_nodes_latlon ON nodes(lat, lon);
```
- **Purpose**: Store intersection points
- **Rows**: ~5.2 million
- **Size**: ~200MB

### Edges Table
```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_node_id INTEGER NOT NULL,
    to_node_id INTEGER NOT NULL,
    distance_m REAL NOT NULL,
    speed_limit_kmh INTEGER,
    way_id INTEGER,
    road_type TEXT,
    oneway INTEGER DEFAULT 0,
    toll INTEGER DEFAULT 0,
    FOREIGN KEY(from_node_id) REFERENCES nodes(id),
    FOREIGN KEY(to_node_id) REFERENCES nodes(id)
);
CREATE INDEX idx_edges_from ON edges(from_node_id);
CREATE INDEX idx_edges_to ON edges(to_node_id);
```
- **Purpose**: Store road segments
- **Rows**: ~10.5 million
- **Size**: ~800MB

### Ways Table
```sql
CREATE TABLE ways (
    id INTEGER PRIMARY KEY,
    name TEXT,
    highway TEXT,
    speed_limit_kmh INTEGER
);
```
- **Purpose**: Store road metadata
- **Rows**: ~1.5 million
- **Size**: ~100MB

### Turn Restrictions Table
```sql
CREATE TABLE turn_restrictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_way_id INTEGER,
    to_way_id INTEGER,
    restriction_type TEXT
);
```
- **Purpose**: Store turn restrictions
- **Rows**: ~50,000
- **Size**: ~2MB

---

## Algorithm Details

### Bidirectional Dijkstra
```
1. Initialize:
   - forward_dist[start] = 0
   - backward_dist[end] = 0
   - best_distance = ∞
   - meeting_node = None

2. While both queues not empty:
   a. Forward step:
      - Pop node with min distance
      - For each neighbor:
        - Calculate new distance
        - If better, update and push to queue
      - Check if neighbor in backward_dist
      - Update best_distance if better
   
   b. Backward step:
      - Same as forward but from end
   
3. Reconstruct path:
   - Build forward path from start to meeting_node
   - Build backward path from meeting_node to end
   - Combine paths

4. Return path
```

**Complexity**:
- Time: O((V + E) log V) where V = nodes, E = edges
- Space: O(V)

### Haversine Distance
```
R = 6371000 (Earth radius in meters)
φ1 = lat1 in radians
φ2 = lat2 in radians
Δφ = (lat2 - lat1) in radians
Δλ = (lon2 - lon1) in radians

a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
c = 2 * atan2(√a, √(1-a))
d = R * c
```

**Accuracy**: ±0.5% for UK distances

### Bearing Calculation
```
dlon = lon2 - lon1
y = sin(dlon) * cos(lat2)
x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
bearing = atan2(y, x)
```

**Range**: 0 to 2π radians (0° to 360°)

---

## Performance Characteristics

### Memory Usage
```
Nodes:     5.2M × 24 bytes = 125 MB
Edges:     10.5M × 40 bytes = 420 MB
Ways:      1.5M × 50 bytes = 75 MB
Adjacency: 10.5M × 16 bytes = 168 MB
Cache:     10K × 1KB = 10 MB
─────────────────────────────
Total:     ~1.8 GB
```

### Time Complexity
```
Operation              | Time
─────────────────────────────
Load graph             | O(V + E)
Find nearest node      | O(V)
Dijkstra routing       | O((V + E) log V)
Generate instructions  | O(P) where P = path length
Calculate costs        | O(1)
Cache lookup           | O(1)
```

### Space Complexity
```
Operation              | Space
─────────────────────────────
Graph storage          | O(V + E)
Dijkstra search        | O(V)
Path storage           | O(P)
Cache storage          | O(C) where C = cache size
```

---

## Configuration Parameters

### OSM Parser
```python
DRIVABLE_ROADS = {
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'service', 'living_street',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link'
}

DEFAULT_SPEEDS = {
    'motorway': 120,
    'trunk': 100,
    'primary': 90,
    'secondary': 80,
    'tertiary': 60,
    'unclassified': 50,
    'residential': 30,
    'service': 20,
    'living_street': 10
}
```

### Router
```python
SEARCH_RADIUS = 100  # meters (for nearest node)
TIMEOUT = 30  # seconds
```

### Cost Calculator
```python
TOLL_RATES = {
    'motorway': 0.15,  # £/km
    'trunk': 0.05,
    'primary': 0.02,
    'other': 0.0
}

CAZ_RATES = {
    'petrol_diesel': 8.0,  # £ per entry
    'electric': 0.0,
    'hybrid': 4.0,
    'motorcycle': 0.0,
    'truck': 12.0,
    'van': 8.0
}
```

### Cache
```python
MAX_SIZE = 10000  # routes
TTL = 3600  # seconds (1 hour)
```

---

## Extension Points

### Phase 2: Performance Optimization
- Edge weight tuning
- Bidirectional search improvements
- Caching strategies

### Phase 3: Contraction Hierarchies
- Node ordering algorithm
- Shortcut edge creation
- Hierarchical search

### Phase 4: Alternative Routes
- K-shortest paths (Yen's algorithm)
- Route diversity
- Cost-based alternatives

### Phase 5: PWA Integration
- Flask API endpoints
- Parallel engine testing
- Fallback chain configuration

---

## Testing Strategy

### Unit Tests
- Graph loading
- Distance calculations
- Routing algorithm
- Instruction generation
- Cost calculation
- Caching

### Integration Tests
- End-to-end routing
- Multiple routes
- Edge cases

### Performance Tests
- Routing speed
- Memory usage
- Cache efficiency

### Validation Tests
- Accuracy vs GraphHopper
- Distance verification
- Time estimation

---

## Deployment Considerations

### Local Deployment
- Database: `data/uk_router.db` (~2GB)
- Memory: 2GB+ RAM required
- CPU: Modern processor recommended
- Disk: 4GB+ free space

### Cloud Deployment
- Database: Can be stored in cloud storage
- Memory: Scale with instance size
- CPU: Serverless functions possible
- Caching: Redis for distributed cache

---

## Future Enhancements

1. **Contraction Hierarchies** (Phase 3)
   - 10-100x speedup
   - Hierarchical graph structure

2. **Alternative Routes** (Phase 4)
   - K-shortest paths
   - Diverse route options

3. **Multi-Modal Routing**
   - Pedestrian mode
   - Bicycle mode
   - Public transit

4. **Real-Time Updates**
   - Traffic conditions
   - Road closures
   - Dynamic routing

5. **Advanced Features**
   - Map matching
   - Isochrones
   - Matrix API

---

**Architecture Complete! Ready for Phase 2 Implementation** 🚀

