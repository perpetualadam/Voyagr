"""Conservative route-segment proximity and association; no inferred road identity."""
import math


class HazardList(list):
    """List-compatible acquisition result; empty failures must not imply coverage."""
    def __init__(self, values=(), coverage=None):
        super().__init__(values)
        self.coverage = coverage or {'status': 'UNKNOWN'}


class HazardDataset(dict):
    def __init__(self, values=(), coverage=None):
        super().__init__(values)
        self.coverage = coverage or {}


def segment_distance(lat, lon, a, b):
    scale_x = 111320 * math.cos(math.radians(lat))
    ax, ay = (a[1]-lon)*scale_x, (a[0]-lat)*110574
    bx, by = (b[1]-lon)*scale_x, (b[0]-lat)*110574
    dx, dy = bx-ax, by-ay
    t = max(0.0, min(1.0, -(ax*dx+ay*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    return math.hypot(ax+t*dx, ay+t*dy)


class SegmentIndex:
    """Small geographic grid; wide segments have a bounded-storage fallback."""
    CELL = .002

    def __init__(self, coords, road_segments=()):
        self.coords = coords
        self.grid = {}
        self.wide = []
        self.attributes = {}
        for evidence in road_segments or ():
            if not isinstance(evidence,dict): continue
            begin, end = evidence.get('begin_shape_index', 0), evidence.get('end_shape_index', 0)
            if isinstance(begin, int) and isinstance(end, int):
                for i in range(max(0, begin), min(len(coords)-1, end)):
                    self.attributes[i] = evidence
        for i, (a, b) in enumerate(zip(coords, coords[1:])):
            x0, x1 = sorted((math.floor(a[1]/self.CELL), math.floor(b[1]/self.CELL)))
            y0, y1 = sorted((math.floor(a[0]/self.CELL), math.floor(b[0]/self.CELL)))
            if (x1-x0+1)*(y1-y0+1) > 1000:
                self.wide.append(i)
                continue
            for x in range(x0, x1+1):
                for y in range(y0, y1+1):
                    self.grid.setdefault((x, y), []).append(i)

    def nearby(self, lat, lon, radius):
        dy = radius/110574
        dx = radius/(111320*max(.05, math.cos(math.radians(lat))))
        candidates = set(self.wide)
        for x in range(math.floor((lon-dx)/self.CELL), math.floor((lon+dx)/self.CELL)+1):
            for y in range(math.floor((lat-dy)/self.CELL), math.floor((lat+dy)/self.CELL)+1):
                candidates.update(self.grid.get((x, y), ()))
        return [(segment_distance(lat, lon, self.coords[i], self.coords[i+1]), i) for i in candidates]

    def match(self, hazard, category, now):
        """MATCH / POSSIBLE / CLEAR, with road/direction uncertainty retained."""
        try:
            lat, lon = float(hazard['lat']), float(hazard['lon'])
            if not math.isfinite(lat+lon) or abs(lat)>90 or abs(lon)>180:
                return 'POSSIBLE'
            uncertainty = float(hazard.get('position_uncertainty_m',20))
            if not math.isfinite(uncertainty) or uncertainty<0 or uncertainty>170:
                return 'POSSIBLE'
            radius = max(10,30+uncertainty)
            if not math.isfinite(radius):
                return 'POSSIBLE'
        except (ValueError, TypeError, KeyError):
            return 'POSSIBLE'
        near = [(d,i) for d,i in self.nearby(lat, lon, radius) if d <= radius]
        if not near:
            return 'CLEAR'
        possible = False
        for _, i in near:
            evidence = self.attributes.get(i, {})
            road, hazard_road = evidence.get('road_id'), hazard.get('road_id')
            if road is not None and hazard_road is not None and str(road) != str(hazard_road):
                continue
            if evidence.get('level') is not None and hazard.get('level') is not None and evidence['level'] != hazard['level']:
                continue
            bearing = hazard.get('travel_bearing_deg')
            direction_known = hazard.get('directionality') == 'both' or category in ('railway_crossings', 'avoid_points')
            if isinstance(bearing, (int,float)) and math.isfinite(bearing):
                a, b = self.coords[i], self.coords[i+1]
                travel = math.degrees(math.atan2((b[1]-a[1])*math.cos(math.radians(a[0])), b[0]-a[0])) % 360
                delta = abs((bearing-travel+180)%360-180)
                if delta >= 135:
                    continue
                direction_known = delta <= 45
            try:
                stale = hazard.get('valid_until') is not None and float(hazard['valid_until']) < now
            except (ValueError,TypeError):
                stale = True
            # Explicit avoid points are geographic constraints, not inferred roads.
            associated = category == 'avoid_points' or (road is not None and hazard_road is not None)
            if associated and direction_known and not stale:
                return 'MATCH'
            possible = True
        return 'POSSIBLE' if possible else 'CLEAR'
