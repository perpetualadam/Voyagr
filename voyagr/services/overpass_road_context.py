"""Bounded map observations, never legal, lane-choice or navigation authority."""
import datetime
import hashlib
import json
import math
import time

from voyagr.utils.road_matching import RoadIndex
from voyagr.utils.request_budget import WorkBudget, use_budget


def live_context(lat, lon, now=None):
    from overpass_helper import query_overpass

    live_clock = now is None
    now = time.time() * 1000 if live_clock else now
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool)
               and math.isfinite(v) for v in (lat, lon, now)):
        return None
    if not -89.99 < lat < 89.99 or not -179.99 < lon < 179.99:
        return None
    # Stable small tiles share the process-wide Overpass cache across GPS fixes.
    south = round(math.floor(lat / .004) * .004 - .002, 6)
    west = round(math.floor(lon / .004) * .004 - .002, 6)
    bounds = [south, west, round(south + .008, 6), round(west + .008, 6)]
    query = ('[out:json][timeout:2][maxsize:2097152];'
             'way["highway"](' + ','.join(map(str, bounds)) + ');out body geom;')
    try:
        with use_budget(WorkBudget(seconds=2.5)) as budget:
            data = query_overpass(query, cache_ttl=60)
            budget.check()
        if live_clock:
            now = time.time() * 1000
        if not data.get('success') or data.get('response_state') != 'VALID_WITH_DATA':
            return None
        acquired = data['retrieved_at'] * 1000
        timestamp = data.get('dataset_timestamp')
        if not isinstance(timestamp, str):
            return None
        stamp = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            return None
        source_time = stamp.timestamp() * 1000
        # Daily regional snapshots have a different clock from live GPS fixes.
        # This 72h policy is for labelled observations only, not legal evidence.
        if not 0 <= now - acquired <= 60000 or not 0 <= now - source_time <= 72 * 3600000:
            return None
        roads = []
        points = 0
        for item in data['elements']:
            if item.get('type') != 'way' or 'highway' not in item.get('tags', {}):
                return None
            geometry = [[p['lat'], p['lon']] for p in item['geometry']]
            if not item['nodes'] or len(item['nodes']) != len(geometry):
                return None
            points += len(geometry)
            if len(roads) >= 1000 or points > 20000:
                return None
            roads.append(dict(osm_way_id=str(item['id']), node_ids=item['nodes'],
                              geometry=geometry, tags=item['tags']))
        raw = json.dumps(roads, sort_keys=True, allow_nan=False)
        context = dict(schema_version=1, source='Overpass', source_kind='OSM_EXTRACT',
                       attribution='© OpenStreetMap contributors', licence='ODbL-1.0',
                       revision=hashlib.sha256((raw + str(acquired)).encode()).hexdigest(),
                       acquired_at_ms=acquired, source_data_at_ms=source_time,
                       bounds=bounds, roads=roads, restrictions=[], coverage='PARTIAL',
                       speed_observations_only=True, lane_observations_only=True, served_at_ms=now)
        if RoadIndex(context).invalid or len(json.dumps(context)) > 2 * 1024 * 1024:
            return None
        return context
    except (KeyError, TypeError, ValueError, OverflowError, OSError):
        return None
