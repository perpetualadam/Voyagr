#!/usr/bin/env python3
"""
Voyagr — Valhalla live-traffic speed collector (Lever C1).

This is the data-collection half of making Valhalla's *path* traffic-aware. It samples
a grid of points across a configured area, asks the running Valhalla `/locate` endpoint
which graph edge each point lies on, fetches the current TomTom Flow speed there, and
writes a CSV of per-edge current speeds:

    edge_id,way_id,current_speed_kmh,freeflow_speed_kmh,lat,lon

That CSV is the input the Valhalla operator tooling turns into the live-traffic extract
(`traffic_tiles.tar`, already referenced by `valhalla.json` -> mjolnir.traffic_extract).
See deploy/VALHALLA_TRAFFIC_SETUP.md for the end-to-end wiring and a cron example.

Why split it this way: collecting speeds needs the running graph (`/locate`) plus a live
traffic provider (TomTom) — that part is portable and lives here. Writing the binary
traffic tiles must be done with Valhalla's own CLI tools on the box that holds the tile
graph, so this script stops at the CSV and prints the exact next command to run.

The script is intentionally dependency-light (stdlib + `requests`) and fails soft: a bad
TomTom or /locate response for one sample is skipped, never aborting the whole run.

Usage (typical cron entry every ~3 minutes):
    TOMTOM_API_KEY=xxxx VALHALLA_URL=http://localhost:8002 \
    python3 deploy/update_valhalla_traffic.py \
        --bbox 51.28,-0.51,51.69,0.33 \
        --step-km 1.5 \
        --out /opt/valhalla/traffic/current_speeds.csv

Environment variables (used as defaults if the matching flag is omitted):
    TOMTOM_API_KEY   TomTom API key (required for real data)
    VALHALLA_URL     Base URL of the running Valhalla service (default http://localhost:8002)
    VOYAGR_TRAFFIC_BBOX  "south,west,north,east" decimal degrees
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
import time
from typing import Dict, List, Optional, Tuple

try:
    import requests
except ImportError:  # pragma: no cover - operator environment issue
    print("ERROR: this script requires the 'requests' package (pip install requests)", file=sys.stderr)
    sys.exit(2)


TOMTOM_FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"


def parse_bbox(raw: str) -> Tuple[float, float, float, float]:
    """Parse 'south,west,north,east' into floats, validating ordering."""
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox must be 'south,west,north,east'")
    south, west, north, east = (float(p) for p in parts)
    if not (-90 <= south < north <= 90) or not (-180 <= west < east <= 180):
        raise ValueError("bbox out of range or south/west not less than north/east")
    return south, west, north, east


def build_grid(bbox: Tuple[float, float, float, float], step_km: float) -> List[Tuple[float, float]]:
    """Build a lat/lon grid covering the bbox at roughly `step_km` spacing."""
    south, west, north, east = bbox
    # Degrees per km (lat is ~constant; lon scales with cos(lat)).
    lat_step = step_km / 111.0
    mid_lat = (south + north) / 2.0
    lon_step = step_km / (111.0 * max(0.1, math.cos(math.radians(mid_lat))))

    points: List[Tuple[float, float]] = []
    lat = south
    while lat <= north:
        lon = west
        while lon <= east:
            points.append((round(lat, 6), round(lon, 6)))
            lon += lon_step
        lat += lat_step
    return points


def locate_edge(valhalla_url: str, lat: float, lon: float, timeout: float = 4.0) -> Optional[Dict[str, int]]:
    """Ask Valhalla which graph edge a point sits on. Returns {'edge_id','way_id'} or None."""
    try:
        resp = requests.post(
            f"{valhalla_url.rstrip('/')}/locate",
            json={
                "locations": [{"lat": lat, "lon": lon}],
                "costing": "auto",
                "verbose": True,
            },
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        edges = data[0].get("edges") or []
        if not edges:
            return None
        # The first edge is the closest correlated edge to the point.
        edge = edges[0]
        edge_id = edge.get("edge_id")
        way_id = edge.get("way_id")
        if edge_id is None:
            return None
        return {"edge_id": int(edge_id), "way_id": int(way_id) if way_id is not None else -1}
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return None


def tomtom_flow_speed(api_key: str, lat: float, lon: float, timeout: float = 4.0) -> Optional[Tuple[float, float]]:
    """Return (current_speed_kmh, freeflow_speed_kmh) from TomTom Flow, or None."""
    try:
        resp = requests.get(
            TOMTOM_FLOW_URL,
            params={"key": api_key, "point": f"{lat},{lon}", "unit": "KMPH"},
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        flow = resp.json().get("flowSegmentData", {})
        current = flow.get("currentSpeed")
        freeflow = flow.get("freeFlowSpeed")
        if not isinstance(current, (int, float)) or not isinstance(freeflow, (int, float)):
            return None
        if current <= 0 or freeflow <= 0:
            return None
        return float(current), float(freeflow)
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return None


def collect(args: argparse.Namespace) -> int:
    api_key = args.tomtom_key
    if not api_key:
        print("ERROR: no TomTom API key (set --tomtom-key or TOMTOM_API_KEY).", file=sys.stderr)
        return 2

    try:
        bbox = parse_bbox(args.bbox)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    grid = build_grid(bbox, args.step_km)
    print(f"[traffic] sampling {len(grid)} grid points over bbox={args.bbox} step={args.step_km}km")

    # edge_id -> row. De-dupe so several grid points that snap to the same edge collapse to
    # the slowest observed speed (worst-case wins, which is what we want for routing).
    rows: Dict[int, Dict[str, float]] = {}
    located = 0
    flowed = 0

    for i, (lat, lon) in enumerate(grid):
        edge = locate_edge(args.valhalla_url, lat, lon)
        if not edge:
            continue
        located += 1
        flow = tomtom_flow_speed(api_key, lat, lon)
        if not flow:
            continue
        flowed += 1
        current_kmh, freeflow_kmh = flow
        eid = edge["edge_id"]
        prev = rows.get(eid)
        if prev is None or current_kmh < prev["current_speed_kmh"]:
            rows[eid] = {
                "edge_id": eid,
                "way_id": edge["way_id"],
                "current_speed_kmh": round(current_kmh, 1),
                "freeflow_speed_kmh": round(freeflow_kmh, 1),
                "lat": lat,
                "lon": lon,
            }

        # Be polite to TomTom; respect the configured pacing.
        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000.0)
        if (i + 1) % 100 == 0:
            print(f"[traffic] progress {i + 1}/{len(grid)} located={located} flowed={flowed} edges={len(rows)}")

    if not rows:
        print("[traffic] no edge speeds collected (check Valhalla /locate and TomTom key/quota).")
        return 1

    if args.dry_run:
        print(f"[traffic] dry-run: would write {len(rows)} edge rows to {args.out}")
        return 0

    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    # Write atomically so a cron-driven Valhalla consumer never reads a half-written file.
    tmp_path = f"{args.out}.tmp"
    with open(tmp_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["edge_id", "way_id", "current_speed_kmh", "freeflow_speed_kmh", "lat", "lon"])
        for row in rows.values():
            writer.writerow([
                row["edge_id"], row["way_id"], row["current_speed_kmh"],
                row["freeflow_speed_kmh"], row["lat"], row["lon"],
            ])
    os.replace(tmp_path, args.out)

    print(f"[traffic] wrote {len(rows)} edge speed rows -> {args.out}")
    print("[traffic] next step (run on the Valhalla host, see deploy/VALHALLA_TRAFFIC_SETUP.md):")
    print("           valhalla_build_extract -c valhalla.json --with-traffic")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect live per-edge speeds for Valhalla traffic.")
    parser.add_argument(
        "--bbox",
        default=os.getenv("VOYAGR_TRAFFIC_BBOX", ""),
        help="south,west,north,east decimal degrees (or VOYAGR_TRAFFIC_BBOX)",
    )
    parser.add_argument("--step-km", type=float, default=1.5, help="grid spacing in km (default 1.5)")
    parser.add_argument(
        "--valhalla-url",
        default=os.getenv("VALHALLA_URL", "http://localhost:8002"),
        help="running Valhalla base URL (default http://localhost:8002)",
    )
    parser.add_argument(
        "--tomtom-key",
        default=os.getenv("TOMTOM_API_KEY", ""),
        help="TomTom API key (or TOMTOM_API_KEY)",
    )
    parser.add_argument(
        "--out",
        default=os.getenv("VOYAGR_TRAFFIC_OUT", "./tiles/current_speeds.csv"),
        help="output CSV path (default ./tiles/current_speeds.csv)",
    )
    parser.add_argument("--sleep-ms", type=int, default=60, help="pause between samples (TomTom rate limiting)")
    parser.add_argument("--dry-run", action="store_true", help="collect but do not write the CSV")
    args = parser.parse_args()

    if not args.bbox:
        print("ERROR: --bbox is required (or set VOYAGR_TRAFFIC_BBOX).", file=sys.stderr)
        return 2

    return collect(args)


if __name__ == "__main__":
    raise SystemExit(main())
