# Valhalla live-traffic routing (Lever C1)

This makes Valhalla's **path selection** traffic-aware — i.e. the router itself prefers
faster roads when the usual one is congested, across *all* route options — instead of only
adjusting the displayed ETA (Lever B) or excluding flagged segments on reroute (Lever A).

It is **infrastructure work on the Contabo Valhalla host**, not app code. The Flask app
needs no change; once Valhalla has live traffic tiles, the existing `auto` costing uses
them automatically.

`valhalla.json` is already configured for it:

```json
"mjolnir": {
  "tile_extract": "./tiles/tiles.tar",
  "traffic_extract": "./tiles/traffic_tiles.tar"
}
```

and a `dynamic_auto` costing block referencing `traffic_speeds_shm` exists. What's missing
is a process that keeps `traffic_tiles.tar` populated with current speeds.

## Pieces

1. **`deploy/update_valhalla_traffic.py`** (in this repo) — collects current per-edge speeds.
   It samples a grid over your service area, asks the running Valhalla `/locate` which graph
   edge each point is on, fetches the current TomTom Flow speed there, and writes:

   ```
   edge_id,way_id,current_speed_kmh,freeflow_speed_kmh,lat,lon
   ```

2. **Valhalla CLI tooling** (on the box) — turns that CSV into the live-traffic extract that
   `traffic_extract` points at, then reloads it.

## One-time setup

1. Build the base tiles **with traffic support enabled** so each edge has a traffic slot:

   ```bash
   valhalla_build_tiles -c valhalla.json <your-osm.pbf>
   valhalla_build_extract -c valhalla.json --with-traffic   # produces tiles.tar + traffic slots
   ```

2. Decide your service-area bbox (`south,west,north,east`). Example (Greater London):
   `51.28,-0.51,51.69,0.33`.

## Recurring update (cron, every ~3 minutes)

```bash
# /etc/cron.d/voyagr-traffic  (adjust paths/keys)
*/3 * * * * voyagr cd /opt/voyagr && \
  TOMTOM_API_KEY=xxxxx VALHALLA_URL=http://localhost:8002 \
  /usr/bin/python3 deploy/update_valhalla_traffic.py \
    --bbox 51.28,-0.51,51.69,0.33 --step-km 1.5 \
    --out /opt/valhalla/traffic/current_speeds.csv >> /var/log/voyagr-traffic.log 2>&1
```

Then convert the CSV into the live-traffic tar and let Valhalla pick it up. The exact
command depends on your Valhalla version; with current tooling:

```bash
# Associate current speeds onto the graph's traffic slots and (re)write traffic_tiles.tar
valhalla_traffic_assoc -c valhalla.json /opt/valhalla/traffic/current_speeds.csv
# or, for predicted/CSV-driven flows:
valhalla_add_predicted_traffic -t ./tiles -c valhalla.json ...
```

Valhalla memory-maps `traffic_extract`; writing a fresh tar (atomically) is picked up on the
next request without a full restart in most builds. If your build needs it, send the service
a reload/SIGHUP or bounce it.

## Verify it's working

- Request the same congested route with costing `auto` before/after a known jam appears and
  confirm the geometry changes, or that the duration tracks live speeds.
- `valhalla_run_route` with `"costing":"auto"` and check `summary.time` reacts to the CSV.

## Caveats / tuning

- **Quota:** `--step-km` and `--sleep-ms` control how many TomTom calls you make. 1.5 km over
  Greater London is a few hundred points; widen the step or narrow the bbox to cut calls.
- **Edge coverage:** only edges near a sampled point get a live speed; everything else keeps
  its free-flow/historical speed. Denser grids cover more edges at higher API cost.
- **Worst-case de-dupe:** when several grid points snap to one edge, the collector keeps the
  *slowest* observed speed — conservative for routing.
- **Safety:** the collector fails soft (a bad sample is skipped) and writes the CSV
  atomically (`.tmp` then `os.replace`) so Valhalla never reads a partial file.
- This layer is complementary to Levers A/B/C2 in the app: keep those on; this one upgrades
  the *initial* route choice for everyone, not just post-reroute.
