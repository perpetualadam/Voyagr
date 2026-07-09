# VPS verification via copy-paste (human-in-the-loop)

Cloud agents **cannot** reach your VPS or live Valhalla/GraphHopper. This workflow is **viable and recommended**: you run commands on the VPS, paste stdout back into Cursor (desktop or cloud), and the agent interprets results for deploy/merge decisions.

## When to use

| Situation | Who runs VPS commands |
|-----------|------------------------|
| After merging routing/speed/TBT changes | User → paste results to agent |
| Before merging PR #13+ (engine body unchanged but deploy sanity) | Optional |
| Tier 3 smoke (real `/api/route`) | **Must** run on VPS |
| Offline unit tests | Agent or desktop (no VPS) |

## Standard deploy (run first)

```bash
sudo bash /opt/voyagr/deploy/deploy-pull.sh
```

Paste the full output. Expect: `Deploy complete`, HTTP `200` from app-settings curl.

---

## One-shot verification script (recommended)

Copy **everything** below into an SSH session on the VPS:

```bash
#!/bin/bash
set -euo pipefail
APP_DIR="${VOYAGR_APP_DIR:-/opt/voyagr}"
cd "$APP_DIR"

echo "========== 1. GIT / DEPLOY REVISION =========="
git log -1 --oneline
git branch --show-current

echo ""
echo "========== 2. KEY MARKERS ON DISK =========="
echo -n "rv6 cache: "; grep -r "rv6" voyagr_web.py 2>/dev/null | head -1 || echo "NOT FOUND"
echo -n "OSRM maneuvers: "; grep -l "build_osrm_maneuvers" voyagr/utils/osrm.py 2>/dev/null && echo OK || echo "NOT FOUND"
echo -n "request_params (PR#13): "; test -f voyagr/services/routing/request_params.py && echo OK || echo "not merged yet"
echo -n "dedup geometry import: "; grep -q "from voyagr.utils.geometry import" voyagr_web.py && echo OK || echo "not merged yet"
echo -n "JS cache voyagr-app: "; grep -o 'voyagr-app.js?v=[^"]*' voyagr_web.py | head -1

echo ""
echo "========== 3. ROUTING ENGINES =========="
sudo bash "$APP_DIR/deploy/check-routing-engines.sh" || true

echo ""
echo "========== 4. APP HEALTH =========="
curl -sS -o /dev/null -w "app-settings HTTP %{http_code}\n" http://127.0.0.1:5000/api/app-settings
systemctl is-active voyagr 2>/dev/null || echo "voyagr service unknown"

echo ""
echo "========== 5. /api/route SMOKE (local, ~30s) =========="
curl -sf --max-time 30 -X POST http://127.0.0.1:5000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"start":"53.536,-1.380","end":"53.517,-1.150","routing_mode":"auto","enable_hazard_avoidance":true,"avoid_cameras":true}' \
  -o /tmp/voyagr-route-smoke.json 2>/dev/null || echo '{"success":false,"error":"curl failed"}' > /tmp/voyagr-route-smoke.json

python3 -c "
import json
with open('/tmp/voyagr-route-smoke.json') as f:
    d = json.load(f)
print('success:', d.get('success'))
print('source:', d.get('source'))
routes = d.get('routes') or []
print('route_count:', len(routes))
if routes:
    print('route_names:', [r.get('name') for r in routes])
    for i, r in enumerate(routes[:4]):
        m = r.get('maneuvers') or []
        print('  [%d] %s source=%s maneuvers=%d geom_prec=%s' % (
            i, r.get('name'), r.get('source'), len(m), r.get('geometry_precision')))
        if m:
            print('       first: begin_shape_index=%s road_class=%s speed_limit=%s' % (
                m[0].get('begin_shape_index'), m[0].get('road_class'), m[0].get('speed_limit')))
print('routing_degraded:', d.get('routing_degraded'))
w = d.get('routing_warning') or ''
if w:
    print('routing_warning:', w[:120])
"

echo ""
echo "========== 6. RECENT ROUTING LOGS =========="
journalctl -u voyagr -n 40 --no-pager 2>/dev/null | grep -iE 'ROUTING|Valhalla|GraphHopper|OSRM|GRAPHHOPPER|CACHE' | tail -20 || true

echo ""
echo "========== DONE — paste ALL output above into Cursor =========="
```

**Note:** Section 5 writes `/tmp/voyagr-route-smoke.json` and prints a summary. If curl fails, check `journalctl -u voyagr -n 50`.

---

## Simpler fallback: route smoke only

If the one-shot script errors on section 5, run these separately:

```bash
cd /opt/voyagr
git log -1 --oneline

sudo bash /opt/voyagr/deploy/check-routing-engines.sh

curl -sS -X POST http://127.0.0.1:5000/api/route \
  -H 'Content-Type: application/json' \
  -d '{"start":"53.536,-1.380","end":"53.517,-1.150","routing_mode":"auto","enable_hazard_avoidance":true}' \
  | python3 -m json.tool | head -80
```

Paste the JSON (or first 80 lines). Agent checks: `success`, `source`, `routes[].name`, `routes[].maneuvers` length, `geometry_precision`.

---

## What to paste back to the agent

1. Full terminal output from the script (or deploy + check-routing-engines + route JSON).
2. Optional: browser check — hard-refresh PWA, confirm route count and speed widget during nav.
3. Say which branch/commit you expected (e.g. `main` at `5368390` or after PR #13 merge).

## Expected healthy results (main as of 2026-07-09)

| Check | Expected |
|-------|----------|
| `git log -1` | `5368390` or newer (speed widget / OSRM maneuvers) |
| `check-routing-engines.sh` | All local engines OK |
| `/api/route` `success` | `true` |
| `source` | Valhalla and/or GraphHopper — **not** only `OSRM (Fallback)` if engines up |
| `route_count` | 2–4 (Fastest, Scenic, Optimised, Shortest when GH+Valhalla healthy) |
| Each route `maneuvers` | > 0 for Valhalla/GH/OSRM routes |
| Optimised `source` | `GraphHopper` when camera avoidance on |
| JS cache | `voyagr-app.js?v=20260703d` or newer |

After **PR #13** merge, also expect:
- `voyagr/services/routing/request_params.py` exists
- `grep "from voyagr.utils.geometry import" voyagr_web.py` matches

## Browser checks (manual, not pasteable)

- Hard refresh (Ctrl+Shift+R) after deploy
- Calculate route → see 4 alternatives when engines healthy
- Start nav on each route type → speed widget shows limit when possible
- TBT voice/text follows **selected** route (not always Fastest)

---

## For the next desktop agent

**Workflow:** Agent codes → PR → user merges → user runs this doc on VPS → user pastes output → agent confirms Tier 3 or diagnoses failures.

**Do not** assume VPS state from cloud-only test runs. **Do** ask the user to run `docs/handover-vps-verification.md` when:
- Merging routing/backend PRs
- Debugging “only 2 routes” or OSRM fallback
- Verifying speed widget / maneuvers on live engines

**Cloud agent environment setup** (optional, [cursor.com/onboard](https://cursor.com/onboard)): install `requirements-web.txt` + `pytest` for Tier 1 offline tests only — still no substitute for VPS Tier 3.
