# Private access and map loss: investigation and next-incident procedure

Repository baseline: `29d8e6bd3d0f1cccf0325a142a93512cabf0ff7d` (main,
21 November 2026, including PRs #533–#538). This is a repository investigation,
not an inspection of the current VPS or physical phone. No production command,
configuration change, restart, deployment or device-storage operation was performed.

## Findings

| Evidence | Established | Not established |
| --- | --- | --- |
| 21 November operator logs: configuration, road-context, speed-observation and route-warning requests returned 403; after fresh owner login, configuration and later road/speed requests returned 200, and the user saw the limit again | Fresh online requests were denied during that interval; login was followed by recovery | That the phone previously had valid credentials in that session, why credentials were unavailable, or a fifteen-minute expiry |
| 16 November separate cached-login incident: mapped-style request to `liberty/style.json` returned 403; a separate authenticated test of `basic/style.json` returned 404 | The actual style request was denied then; the separately tested style URL was not found | That Basic authentication caused the 404, or that the actual selected style was missing |
| Phone reported a blank/loading map while buttons/text directions remained | The application could remain interactive without visible map rendering | A WebGL event, failed tile request, source outage, or exact trigger at that instant |
| Map stayed visible in the later stationary test of more than fifteen minutes, but the limit became unavailable | That particular visibility test did not reproduce map loss | Moving-navigation stability, fresh GPS, working providers, or a timer-based auth failure |
| Info showed “style loaded”, last GPS accuracy, unavailable road/primary evidence, and inactive navigation | Those states were displayed | That the canvas painted correctly, tiles were fresh, the last fix was current, or all messages described a single new failure |
| PR #535 merged and synthetic tests passed | Recovery UI exists on main | That its shell was deployed and activated on this phone |

No new application defect causing the reported incident has been confirmed.
Do not change authentication, extend speed-data freshness, disable recovery gates
or recreate the map based on this evidence. A missing incident trace is a diagnostic
gap, not proof that the problem cannot recur. The recorded prompt-flicker issue
was separately repaired at Nginx; #535 improved presentation and recovery, not
credential retention. No fifteen-minute authentication timeout appears in that repair.

## How the layers interact

1. The documented Nginx gate authenticates each request against the existing owner
   password file via an internal Unix-socket verifier. A document navigation gets
   a 401 Basic challenge when unauthorized. Fetch Metadata modes `cors`, `no-cors`
   and `same-origin` get a background 403 without a new challenge. Missing Fetch
   Metadata retains challenge behaviour. Passwords are stripped before proxying to
   app/map upstreams. There is no application account or session-expiry timer here.
   The browser manages its HTTP-authentication cache; separate profiles/incognito
   contexts and different origins must not be assumed to share it.
2. Chrome can register a service worker from a normal browser tab; installation
   as a home-screen app is not required. The current worker stages a coherent
   shell/assets release. Root network denial or failed staging can fall back to
   an already committed shell. Cached tiles can remain visible while uncached
   resources fail. This can delay the visible symptom until a pan/zoom/follow
   requests new tiles; this is plausible, not the demonstrated original cause.
3. `/api/config` is network-only in the worker. The personal shell probes it on
   opening, focus, online/visibility events, and every thirty seconds while visible;
   overlapping probes share one request, bounded by an eight-second abort. Only
   401/403 establish denial. A successful check clears it; offline/timeouts/server
   errors retain the last confirmed state and mark the latest check incomplete.
   “Last check passed” is not an assertion of continuous network health.
4. Startup/active navigation defers both unlock actions; an outstanding journey
   summary defers the overlay. #535 provides passive Info text and a stationary
   link opening the protected privacy page in a new tab. A standing user can still
   have an active navigation state: physical stillness alone does not end a journey.
   No automatic redirect, focus theft or storage clearing is intended.
5. Map styles, source descriptions, tiles, fonts and sprites are separate requests,
   generally rewritten to the same-origin map proxy. Configuration 200 does not
   prove any of these resources loaded. Cached responses and optional traffic/
   weather layers must be distinguished from the base map. A backend provider
   may be unavailable inside an otherwise successful HTTP 200 API envelope.
6. WebGL recovery is independent. Canvas context-loss events trigger bounded restore
   attempts while visible (delays of 1, 3 and 10 seconds), with one further burst
   after a genuine hidden-to-visible return if the first burst was exhausted.
   Unsupported restoration is reported. Separate network/focus/visibility recovery
   and a 45-second visible-page heartbeat can repaint/reload sources; timer
   throttling or OS suspension means this is not a guaranteed recovery deadline.
   The graphics-loss hook says navigation continues; a latched initialization/map
   transaction failure instead stops navigation and requires explicit recovery and
   recalculation. Historical failure text is not a timestamped new WebGL event.
7. GPS fix age/accuracy and road association govern position/speed evidence. A stale
   fix can remove the limit without blanking the base map. A numeric accuracy from
   the last accepted fix alone says nothing about freshness. GPS tracking increases
   work and requests, but the supplied evidence does not prove GPS caused map loss.

Sources: [access probe](../../static/js/app/private-access.js),
[worker](../../service-worker.js),
[Nginx repair](repair-private-prompts.py),
[core map wiring](../../static/js/voyagr-core.js),
[bounded GL recovery](../../static/js/modules/map/map-context-recovery.js),
[network/source recovery](../../static/js/modules/map/map-recovery.js),
[navigation lifecycle](../../static/js/app/navigation-lifecycle-orchestration.js),
[speed evidence](../../static/js/app/speed-widget-orchestration.js), and
[operator/deployment evidence](README.md).

## Next occurrence: preserve first, recover second

Only interact when parked or let a passenger observe. Keep the original tab open.
Do not clear site data, uninstall, unregister the worker, press Refresh/Check Updates,
force a graphics loss, change settings, or restart anything to collect evidence.
Those actions can erase the transient evidence or alter the failure. Do not change
Android power/background settings as part of the initial capture.

1. Note UTC time (or phone time plus timezone), whether navigation is active,
   whether Stop/Done or a summary is showing, whether the screen recently locked
   or Chrome left/returned to the foreground, and whether the network changed.
   Capture the exact loading/recovery message. Crop any screenshot to statuses;
   exclude the map, street names, instructions, destination and coordinates.
2. Read Route Info: private access status and deferral reason; map-renderer status;
   navigation-active state; speed/GPS availability. An old shell may lack #535's
   status; record “not present”, not “access passed”. Accuracy is not fix age.
3. If an already enabled, trusted remote-inspection connection is available, use
   Chrome inspection of that phone tab (`chrome://inspect/#devices`). Inspect the failed tab, not a
   fresh desktop tab. Otherwise use phone Info and the VPS checks; changing device
   debugging permissions is not part of this capture. Network “Preserve log” helps future failures; keep the normal
   cache enabled so the original behaviour is retained. Record method, resource
   **class**, status, time and whether “service worker/memory/disk cache” served it.
   Prioritize config, base-map style/source/tile resources and the existing road/
   speed/warning requests. Do not copy full tile URLs: z/x/y identifies geography.
4. Capture a passive browser snapshot below. A future event observer cannot prove
   an earlier graphics event. After capture, if access is denied and the user is
   safely stopped, use the existing explicit unlock link in a new tab; return to
   the original tab. Note the before/after times, config status, map status and
   whether new tiles and the limit recover. Do not assume a successful terminal
   curl has authenticated Chrome.
5. If a navigation initialization failure remains latched, record it before using
   the existing recovery action. Successful website login does not itself clear
   that failure or authorize navigation. Recalculate from the actual location as
   required by the existing UI; do not explicitly end a retained journey merely
   to diagnose an unrelated lookup failure.

### Optional passive console capture on the phone tab

Paste only into the trusted inspected tab. This issues no requests, reads no
storage or route geometry, and emits no addresses, tokens or position coordinates. It samples
current state and attaches passive listeners to the current canvas and page;
records exist in memory only (maximum twenty), and `stop()` removes the listeners.
If the canvas is replaced, stop and reinstall to observe the new canvas. Copy only
`read()`'s JSON string, never dump the map/GPS/config objects. The current fix getter
is read only to bucket its age; coordinates are neither selected nor emitted.

```js
(() => {
  window.voyagrIncidentCapture?.stop();
  const rows = [], removers = [];
  const bool = value => typeof value === 'boolean' ? value : null;
  const attempt = fn => { try { return fn(); } catch (_) { return null; } };
  const capture = event => {
    const map = attempt(() => window.__voyagrMapGetDiagnostics?.());
    const nav = window.VoyagrNavigationLifecycleOrchestration;
    const fix = attempt(() => window.VoyagrGpsOrchestration?.getAcceptedOriginFix?.());
    const age = fix && Number.isFinite(fix.timestamp) ? Date.now() - fix.timestamp : null;
    const manifest = attempt(() => JSON.parse(document.getElementById('voyagr-asset-manifest').textContent));
    const summary = document.getElementById('journeySummaryModal');
    rows.push({
      utc: new Date().toISOString(), event,
      visible: document.visibilityState === 'visible', online_hint: navigator.onLine,
      worker_controls_tab: !!navigator.serviceWorker?.controller,
      shell_release: /^[a-f0-9]{64}$/.test(manifest?.release || '') ? manifest.release : null,
      navigation_active: bool(attempt(() => nav?.getRouteInProgress?.())),
      navigation_starting: bool(attempt(() => nav?.getNavigationStarting?.())),
      navigation_failure_latched: !!attempt(() => nav?.getNavigationFailure?.()),
      summary_own_display_open: !!summary && !summary.hidden && getComputedStyle(summary).display !== 'none',
      access_info: document.getElementById('privateAccessStatus')?.textContent || 'not present',
      graphics_context_lost: bool(map?.contextLost), style_loaded: bool(map?.isStyleLoaded),
      canvas_has_size: map?.canvas ? map.canvas.width > 0 && map.canvas.height > 0 : null,
      gps_age: age === null ? 'no accepted fix' : age < -1000 ? 'clock ahead' :
        age <= 15000 ? 'within 15s' : age <= 60000 ? '15-60s' : 'over 60s'
    });
    if (rows.length > 20) rows.shift();
  };
  const listen = (target, name) => {
    if (!target) return;
    const handler = () => capture(name);
    target.addEventListener(name, handler, {passive:true});
    removers.push(() => target.removeEventListener(name, handler));
  };
  const canvas = document.querySelector('#map canvas');
  ['webglcontextlost','webglcontextrestored'].forEach(name => listen(canvas, name));
  listen(document, 'visibilitychange');
  ['online','offline','focus'].forEach(name => listen(window, name));
  window.voyagrIncidentCapture = {
    read: () => JSON.stringify(rows, null, 2),
    sample: () => capture('manual'),
    stop: () => removers.splice(0).forEach(remove => remove())
  };
  capture('installed');
  return 'Passive capture installed; no network or storage changes.';
})()
```

After the next symptom: `voyagrIncidentCapture.sample()` then
`voyagrIncidentCapture.read()`. The summary field measures the summary element's
own display state, matching the current deferral check; it does not assert that
its parent sheet is onscreen. `online_hint` is not an internet reachability test.
A false graphics-context-loss result does not exclude a stalled GPU or invisible
canvas; absence of a prior event is not proof of no earlier loss.

## Read-only VPS checks

These are proposed operator commands, not commands executed against production
by this investigation. Mark their UTC time: they generate diagnostic HTTP log
entries which must not be mistaken for phone requests. None changes services,
configuration, authentication settings or device data. Never print `/api/config`
bodies: they can contain API keys even when account-free mode is on.

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
git -C /opt/voyagr log -1 --format='%h %s'
systemctl is-active voyagr nginx
ss -ltn 'sport = :5000'
curl --silent --show-error --max-time 10 --head http://127.0.0.1:5000/ |
  awk 'tolower($0) ~ /^(http\/|x-voyagr-asset-release:)/'
```

The checkout commit and `/api/deployed-version` describe files on disk; alone they
do not prove the workers restarted or the phone loaded that release. Compare the
live root `X-Voyagr-Asset-Release` with the inspected phone document's release
(the snapshot above). Do not reload the phone merely to obtain the server header.
Different hashes show different executable release identities, not necessarily
corruption; equal hashes do not validate authentication, tiles or GPS. Worker
presence and a cache-version string alone do not establish the loaded app version.

Check the public gate with one anonymous probe and, separately, owner access.
`--user owner` prompts securely; never append the password, use verbose curl,
print Authorization/cookies, or paste credentials into a URL. These curl sessions
are independent of the phone's HTTP-authentication cache. Do not follow redirects
with owner credentials to another host; inspect a 3xx destination locally first.

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
curl --silent --show-error --max-time 15 -H 'Sec-Fetch-Mode: cors' \
  --output /dev/null --write-out 'anonymous config HTTP %{http_code}\n' \
  https://vibevoyager.org/api/config
curl --user owner --silent --show-error --max-time 15 \
  --output /dev/null --write-out 'owner config HTTP %{http_code}\n' \
  https://vibevoyager.org/api/config
```

Expected for the documented repair: anonymous background config 403, owner config
200. A document root/owner-login navigation without background Fetch Metadata
should challenge with 401 when anonymous. An authenticated **actual selected style**
should return JSON 200; use its already observed style-only path without query
parameters, never a guessed `basic` path or a geographically identifying tile URL.
Do not initiate new GPS/provider POSTs or replay a private journey to diagnose this.
If config succeeds but map requests do not, compare map-proxy/upstream behaviour.
A localhost app request bypasses the Nginx gate and cannot validate public access.

### Sanitized, short-window access-log summary

This reads only the last 3,000 existing access-log lines and outputs aggregated
UTC minute/resource-class/status counts for the last ten minutes. No IP, username,
host, user agent, query, request body, response body or tile coordinate is printed.
It writes no file and changes no logging configuration. Run on VPS1. Standard
combined logs do not identify the tab or host, so correlation alone cannot prove
these are the phone's requests, especially during your own curl checks. Do not
share the unfiltered log if parsing finds no matches; review the format locally.

```sh
sudo python3 - <<'PY'
import collections, datetime as dt, re, subprocess
from urllib.parse import urlsplit
now = dt.datetime.now(dt.timezone.utc)
lines = subprocess.check_output(['tail','-n','3000','/var/log/nginx/access.log'],
    text=True, errors='replace', stderr=subprocess.DEVNULL).splitlines()
pattern = re.compile(r'\[([^\]]+)\] "(?:GET|HEAD|POST) ([^ ]+) HTTP/[^\"]+" (\d{3})\b')
fixed = {'/':'document','/privacy':'owner_unlock','/api/config':'config',
    '/api/road-context':'road_context','/api/speed-limit/observation':'speed_observation',
    '/api/route-warning-observations':'route_warnings','/service-worker.js':'worker'}
counts = collections.Counter()
for line in lines:
    match = pattern.search(line)
    if not match:
        continue
    try:
        when = dt.datetime.strptime(match[1], '%d/%b/%Y:%H:%M:%S %z').astimezone(dt.timezone.utc)
        if not 0 <= (now-when).total_seconds() <= 600:
            continue
        path = urlsplit(match[2]).path
    except (ValueError, OverflowError):
        continue
    kind = fixed.get(path)
    if kind is None:
        if path.startswith(('/_voyagr/assets/','/static/js/','/static/css/')):
            kind = 'executable_asset'
        elif path.startswith(('/map/','/styles/','/fonts/','/glyphs/','/sprites/','/data/','/tiles/')):
            kind = 'map_style' if path.endswith('/style.json') else 'map_resource'
        else:
            continue
    counts[(when.strftime('%Y-%m-%dT%H:%MZ'),kind,match[3])] += 1
for (minute,kind,status),count in sorted(counts.items()):
    print(minute,kind,status,count)
if not counts:
    print('No matching recent entries in the bounded standard-format log window.')
PY
```

Do not share raw Nginx/Gunicorn errors, a full `nginx -T`, HAR files, “Copy as curl”,
full console dumps, exported local storage, environment files, password files,
headers containing Authorization/Set-Cookie, provider URLs or private route bodies.
Inspect an error locally and transcribe only time, a generic resource class and
status/error category. A stock log without upstream timing/status cannot establish
whether a 403 originated in this verifier, another Nginx rule or an upstream; that
would require a separately reviewed logging change if basic observations cannot
resolve it. Do not make that change as part of this procedure.

## Interpret the combined evidence

| Observation at the same time | Interpretation / next distinction |
| --- | --- |
| Phone config 401/403 plus map/API denials; owner login followed by fresh 200s | Access denial is supported; unavailable browser credentials are plausible. Does not establish credential expiry or explain an earlier map failure without its map trace. |
| Config 200 but style/font/tile 401/403 | Look for path/origin/credentials/gate differences. Config success cannot clear a resource-specific failure. Do not remove protection. |
| No HTTP response, fetch rejection, timeout or curl 000 | Connectivity/DNS/TLS/abort is possible; no proof of auth expiry. `navigator.onLine` can still be true. |
| 429 | Rate limiting, not an expired login; avoid refresh storms and capture the affected class. |
| Map resources 502/504 with config 200 | Map proxy/upstream failure is supported; not evidence of GPS failure. |
| Map resource 404 | Check the exact requested style/source path and loaded release. A guessed-style 404 is not a diagnosis. |
| API 200 but observation/coverage unavailable | Read only the status/reason fields locally; transport/auth succeeded for that request, not provider data availability. Never export the complete payload. |
| Cached map/shell 200, fresh config 403 | Cached resources concealed current online denial; cached 200 does not prove authentication. |
| GL-loss event/contextLost true with contemporaneous good network requests | Graphics loss is established; network/auth issues can still coexist. Record restored/unavailable event and timing. |
| ContextLost false or “style loaded” but blank canvas | Graphics stall, zero-size/covered canvas, source/content failure or another rendering problem remains possible. These labels do not prove rendered pixels. |
| Stale/no accepted fix while base map and config work | GPS evidence is unavailable; this can explain missing speed/route position, not necessarily the blank map. |
| Navigation inactive/failure latched | Investigate the earlier initialization/replacement failure separately. Do not infer a new GL event solely from old failure text. |

Minimum useful incident bundle: timestamp/timezone; loaded phone release and live
server release (or “unknown”); active/starting/summary/failure booleans; private
access text; one fresh config result; statuses/cache provenance for one affected
base-map resource class; a GL event/snapshot if obtainable; GPS-age bucket; and
before/after recovery times/results. Labels without contemporaneous network or
renderer evidence leave the cause unresolved. Report only this reduced bundle.

## Validation and change boundary

The current unit regressions exercise denial versus offline/server errors, request
deduplication/timeout, navigation/summary deferral, cached-sensitive API handling,
GL retry bounds, hidden/foreground transitions, source-specific failures and stale
recovery cancellation. Isolated Chromium fixtures can reproduce cached-shell
login recovery and synthetic GPU loss while retaining a journey. They cannot
reproduce the Pixel's radio, thermal/memory conditions or credential history.

Validation in this investigation: 78 targeted unit cases passed; isolated cached-
worker login and real-MapLibre synthetic GL recovery checks passed (390px and
1280px, including refused initial restoration). The declared CI backend selection
passed 2,548 tests, with one skip and 94 passing subtests; JavaScript passed 3,829
tests in 198 suites and test lint passed. The documented shell snippets passed
syntax checks; synthetic log/console fixtures verified redaction, bounded capture
and listener teardown. No production or physical-phone check is counted as passed.

No speculative runtime repair is proposed. This runbook supplies the missing
capture procedure. Any later confirmed defect should get a narrow regression
and reviewed code change. Production deployment, logging/configuration changes,
authentication changes and service restarts require separate explicit approval.
