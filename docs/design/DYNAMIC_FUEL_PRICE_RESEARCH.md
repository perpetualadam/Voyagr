# Dynamic fuel-price research and staged integration

Researched 8 November 2026. Implementation records below track the parser/cache
and automatic/manual route-price integration. No credentials, provider
registration or production changes are included. Preserve the existing Overpass,
arrival and unit/device checklists.

## Recommendation

Use the UK government's Fuel Finder as the target station-price source. First
implement a smaller automatic **UK weekly-average estimate**, using the public
DESNZ publication, with manual/configured fallback. This requires no Fuel Finder
account and establishes normalization, provenance, override precedence and safe
failure handling before adding station matching and authentication.

A changing price improves only the price component of an estimate. It does not
establish actual consumption, the fuel already in the tank or a future pump bill.
Keep the estimated-cost label and never promise the cheapest or exact journey.

## Sources checked

| Candidate | Verified public information | Decision / limits |
| --- | --- | --- |
| [Government Fuel Finder access guidance](https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email) | Station prices by fuel type, site details and update timestamps. API uses authenticated OAuth client credentials; access starts with GOV.UK One Login. CSV snapshots are published twice daily. | Preferred later station source. Data-recipient access is distinct from trader price-reporting access. |
| [Motor Fuel Price (Open Data) Regulations 2025](https://www.legislation.gov.uk/uksi/2025/1356/made/data.html) | Scheme extends to England/Wales, Scotland **and Northern Ireland**. It covers petrol/diesel; reporting follows price changes within 30 minutes. Recipients must follow aggregator access/use standards. | UK scope is established, not complete/current reporting at every station. This is not an EV-tariff feed. |
| [DESNZ weekly road fuel prices](https://www.gov.uk/government/statistics/weekly-road-fuel-prices) | Public national petrol/diesel pump-price series with CSV downloads, observation dates and pence/litre columns; publication updated 3 November 2026 when checked. | Recommended first automatic estimate/fallback. A UK aggregate is not a local or Northern-Ireland-specific station quote. Retain attribution and the publication's reuse terms. |
| [Withdrawn CMA interim retailer-feed page](https://www.gov.uk/guidance/access-fuel-price-data) | Page is withdrawn and directs users to Fuel Finder. | Do not build a new primary integration around the old retailer endpoint list. |
| [FuelCosts.co.uk developer documentation](https://fuelcosts.co.uk/docs) | Provider describes a no-key API derived from Fuel Finder, with four-minute refreshes. Its prices use pence and its search radius uses miles. | Possible separately reviewed intermediary, not a government endpoint or an independently verified SLA. It adds another availability/terms dependency; do not silently use it as a substitute. |

The [government driver factsheet](https://www.gov.uk/government/news/fuel-finder-for-drivers-factsheet)
acknowledges incomplete participation at its publication date. Do not turn that
historical figure into a current station count or claim statutory scope proves
live coverage. Northern Ireland must be included in actual acceptance samples.

The official developer links
[access portal](https://www.developer.fuel-finder.service.gov.uk/access-latest-fuelprices)
and [public API page](https://www.developer.fuel-finder.service.gov.uk/public-api)
returned HTTP 403 through the research browser. Therefore the **exact current
read endpoints, response schema, price units, pagination, token lifetime, rate
limits, bulk/delta protocol and recipient licence/attribution terms remain
unverified**. Do not copy an unofficial mirrored specification into a production
client as if authenticated documentation had been reviewed. GOV.UK page-footer
licensing is not by itself proof of the API dataset's complete recipient terms.
No account was created, terms accepted, credentials requested or authenticated
station API exercised during this research.

For the weekly source, the [published CSV preview](https://www.gov.uk/csv-preview/6aa801e097b321a2d34ee250/CSV__2018_-__.csv)
had a 2 November 2026 observation of 172.78 p/L petrol and 198.58 p/L diesel
when checked. These are dated research observations, **not values to hard-code**.
Divide the pump-price column by 100 exactly once to obtain GBP/L; do not use the
separate duty/VAT columns as extra charges. Discover the current attachment from
the stable publication rather than assuming a content-hashed CSV URL is permanent.
The linked [methodology](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/680770/petrol_price_methodology.pdf)
describes survey-derived weighted averages; its historic sample/quality figures
must not be presented as measured current station coverage.

## Repository findings at the research baseline

- `static/js/modules/navigation/route-prefs.js:getRouteCostParams` always sends a
  price: a `fuelPrice` localStorage override or a static default. Updating backend
  defaults alone will not activate automatic prices for normal browser requests.
- `voyagr/config/rates.py:resolve_route_cost_params` takes supplied values before
  configured defaults. Its vehicle-type heuristic distinguishes some diesel
  defaults, while the browser's `petrol_diesel` choice cannot identify a fuel grade.
  Do not infer petrol/diesel or premium grade from car size, route provider or
  a combined vehicle label.
- `voyagr/services/costs.py` already computes litres from distance and L/100 km,
  then multiplies by GBP/L. EV calculations use kWh/100 km and GBP/kWh. Reuse these
  canonical quantities; price ingestion must not reinterpret consumption or MPG.
- The preview/comparison/share/history paths need an explicit price basis and
  source date alongside existing amounts. A fresh retrieval must not renew an
  old observation. The current currency fix retains GBP; no FX mechanism exists.
- Overpass supplies mapped fuel locations/types, not verified current prices.
  Fuel Finder station identities will not automatically equal OSM or TomTom IDs.

## First executable increment: weekly average

The following are **proposed Voyagr policies**, not provider guarantees:

1. Add explicit automatic/manual price mode and regular petrol/diesel selection.
   Preserve existing saved prices as legacy overrides until the user opts into
   automatic pricing; never delete or silently reinterpret them. Keep premium,
   unknown fuel type and EV pricing on a clearly labelled existing/manual fallback
   until supported. Selecting a fuel for estimates is not a compatibility claim.
2. A bounded server-side refresh discovers the CSV from an allowlisted HTTPS
   publication and attachment host, validates headers, dates and finite positive
   pump prices, and publishes an atomic last-good snapshot. Reject HTML/error
   bodies, oversized/truncated files, duplicate/conflicting latest rows, unknown
   units and future/implausible observations. No per-user coordinates are needed.
3. Proposed refresh cadence: once daily with single-flight/concurrency bounds,
   short transport/body/time limits and retry backoff. Cache using original
   observation and retrieval clocks. Proposed maximum automatically usable source
   age: 14 days, displayed with its date; beyond that, label cached data stale and
   use the explicit manual/configured fallback. Test holiday/late-publication
   behavior. These thresholds must be configurable and covered by tests.
4. Make route requests distinguish automatic intent from explicit overrides.
   Resolve one price snapshot per calculation and reuse it across alternatives,
   legs and cost endpoints. Missing/cold/failed refresh must return promptly using
   fallback; route geometry/navigation never waits for a statistics provider.
5. Carry a versioned quote basis: source, national-average/manual/default kind,
   fuel category, original value/unit, normalized GBP/L, source observation date,
   retrieval time, freshness/fallback reason and snapshot identity. Preserve it
   through preview, comparisons, saved routes and sharing. A saved trip must not
   acquire today's price merely because it was reopened.
6. Keep geometry, journey identity, safety assessments and selected-route index
   unchanged on background updates. Apply new prices on a new explicit calculation
   or cost refresh, not by silently reranking alternatives or repricing an active
   trip. Manual prices remain authoritative while manual mode is selected.

Example UI basis: “Fuel estimate uses UK weekly petrol average, £X.XXX/L,
as of DATE.” Fall back to “Configured estimate” or “Your price” when applicable;
never describe national data as a nearby station price or as live pump data.

## Later station-price increment

Once recipient access and the official contract are available, build a separate
read-only adapter. Keep client credentials and tokens server-side and outside
browser/service-worker caches and logs. Confirm reuse/attribution, allowed access
patterns and quotas before choosing polling or bulk refresh. No trader write API
is required. Do not ask the user to paste credentials in chat.

Retain station IDs, per-grade observation times, source units and retrieval
provenance. Validate country/location and station identity; reject malformed or
out-of-area coordinates. Include Northern Ireland explicitly and exclude Republic
of Ireland EUR quotes from a GBP-only estimator. Do not use a Great-Britain-only
bounding region. Validate the exact fuel grade; missing data is unknown, not zero.

A selected station quote may be used only as a labelled estimate basis. A general
route estimate must not silently choose the cheapest station, assume a refuelling
stop, or infer road access/entrances from point proximity. Any regional aggregate
needs documented grade/sample/coverage rules. Keep national-average and manual/
configured fallback paths independent of station API availability.

## Acceptance checklist and next step

- [x] Primary-source research and current code-path trace recorded.
- [x] Implement the inactive weekly-average parser/snapshot cache with fixture HTTP
  and an explicit operator command (implementation record below).
- [ ] Connect opt-in automatic/manual and fuel-category request/UI handling with
  manual/configured fallback in a separate review.
- [ ] Test pence/GBP conversion, numeric rejection, date order, malformed/latest-row
  conflicts, stale/cold caches, timeouts, concurrent refresh and atomic rollback.
- [ ] Test explicit grade/mode and legacy overrides; electric/premium/unknown
  behavior; shared snapshot for all route alternatives/legs/cost views; persisted
  source provenance and no geometry/selection/live-state changes.
- [ ] Validate deployed source dates and manual override behavior, then sample known
  forecourts in England, Wales, Scotland and Northern Ireland for the later station
  adapter. An authenticated API response is not proof of price accuracy or access.

The present research branch changes documentation only. No live provider refresh,
price migration, routing behavior or production configuration is enabled.

Documentation verification: primary links/publication dates and the local request/
cost paths were reviewed. Existing declared checks passed unchanged: 141 JavaScript
suites / 3,042 tests with lint and coverage floors; web backend selection 1,983
passed, one platform skip and 74 subtests passed. These regressions do not verify
an authenticated Fuel Finder client or a live price-ingestion deployment.

## Implemented step 1: inactive parser/cache and explicit operator command

`voyagr/services/weekly_fuel_prices.py` implements the acquisition boundary and
snapshot cache. This first increment shipped without routing imports, client
instantiation, startup fetches, jobs or price changes. Step 2 below adds the
explicit automatic/manual/fuel-category request contract and snapshot reads;
source refresh remains an explicit operator responsibility.

The adapter discovers the newest labelled CSV series from the fixed GOV.UK
publication. All publication and attachment redirects are checked before access:
HTTPS, fixed hosts, expected publication/CSV paths, no credentials, ports, query
strings or fragments. It uses the existing cooperative request-budget transport,
a default 12-second acquisition budget, 3/5-second connect/read caps, at most
four requests per redirect chain, a 512 KiB publication cap, 2 MiB CSV cap and
10,000-row cap. This is cooperative deadline handling, not a hard interruption
of a blocked socket or filesystem operation.

The CSV parser accepts UTF-8/BOM, verifies the exact pump-price pence/litre
headers, rejects duplicate headers/dates and malformed/future/truncated records,
and selects the greatest observation date rather than the last file row. A
reviewed plausibility guard accepts 50–500 pence/litre, rejecting common pound/
pence errors; this is a Voyagr ingestion guard, not a government price rule.
Both petrol and diesel must validate together. Pence become GBP/L using Decimal,
without adding the separate duty/VAT columns. Immutable snapshots retain source
URL, observation/retrieval clocks and a stable identity for the dated prices.

`WeeklyFuelPriceCache.quote('petrol'|'diesel')` is an in-memory, no-HTTP read.
Missing, future or older-than-policy observations return `None`, never zero or
an invented default. The default maximum usable observation age is 14 days,
inclusive by UTC date; the old snapshot remains available for explicit status/
inspection but is not returned as an automatic quote. Successful reacquisition
can advance retrieval time while preserving observation date and price identity;
cache/quote reads cannot renew either clock. Caller dictionaries cannot mutate
the immutable snapshot.

Refresh is single-flight without queuing per instance. With an explicit cache
path, nonblocking POSIX advisory locks also coordinate processes. Last-good JSON
is schema/size/date/unit/URL checked on load, and complete replacements use a
same-directory private temporary file, fsync and atomic rename. Older source
observations, failed acquisition, write failure or expired/cancelled work cannot
replace a known-good snapshot. Persistent refresh is supported on the POSIX VPS
target; a non-POSIX persistent writer fails closed rather than writing unlocked.
Memory-only caches remain available without a persistent lock.

Daily refresh cadence and a 60-second exponential failure backoff (capped at one
hour) are defaults. Age/cadence/budget are constructor policies; failures/backoff
are process-local and successful retrieval time is persisted. Operate **one
scheduled refresher**, not one job per web worker; no scheduler is installed in
this increment. `force=True` bypasses cadence/backoff only, not validation or
locking. Future route requests must read a ready cache and use their existing
manual/configured fallback without waiting for refresh.

An explicit operator command is available from the repository root:

```sh
.venv/bin/python scripts/refresh-weekly-fuel-prices.py --help
.venv/bin/python scripts/refresh-weekly-fuel-prices.py
.venv/bin/python scripts/refresh-weekly-fuel-prices.py --cache-file /path/to/owned-directory/fuel-weekly.json
```

The first command performs no acquisition; the second refreshes memory only.
For a file, its parent directory must already exist and be writable, and the
refresher/reader must have compatible ownership (new snapshot/lock files are
private). No directory, production config or job is created automatically. JSON
output reports refresh/cache status and any usable quotes, with
`route_pricing_changed: false`. Exit 0 means a usable quote is available without
refresh failure, 1 means refresh failed, and 2 means no usable quote is available.
`--force` and `--max-age-days` are explicit operator options. No source body,
credential or raw request exception is printed.

Verification for this increment uses fixture HTTP through the real transport,
discovery, parser, budgets and persistence paths, including a second process
observing the file lock. Operator-command tests use an explicit temporary cache.
The runner could not reach GOV.UK through its configured execution proxy, though
the publication was readable through the research browser. **Live Python HTTP
refresh and deployed dataset acceptance remain unverified.** No production cache,
configuration/data changes or deployment were performed. No UI or routing wiring
is enabled by importing or invoking this layer.

Local validation for the parser/cache increment: 57 focused acquisition/cache/
operator tests passed. The declared web backend selection passed 2,040 tests,
with one platform skip and 74 subtests; 141 JavaScript suites / 3,042 tests,
lint and coverage requirements also passed. No new browser UI was introduced,
and these checks do not establish live GOV.UK HTTP refresh or deployed pricing.

## Implemented step 2: automatic/manual selection and frozen route quotes

The browser now offers a collapsed **Fuel price estimate** disclosure with an
explicit petrol/diesel category and automatic/manual choice. A legacy saved
`fuelPrice` remains manual until the user opts into automatic; switching to auto
retains the manual value for switching back. Settings snapshots/export and profile
switches preserve the choice while isolating one profile from another. Price
controls are explicitly GBP per litre, independent of display currency/distance.
Electric costs keep the existing GBP/kWh tariff; no EV feed was added.

Each explicit `/api/route` calculation resolves exactly one quote, before any
alternatives or multi-drop branch. The separate multi-stop endpoint follows the
same contract. Automatic mode reads the bounded, validated local snapshot only
when petrol/diesel is explicitly chosen. It does **no source HTTP, refresh,
background work or file writes** during route requests. A snapshot older than
14 days, missing/invalid cache or missing category uses the configured estimate
with `CONFIGURED_FALLBACK` and a reason. An explicitly invalid manual price
returns a validation error rather than silently becoming an automatic/default
price. The combined vehicle label does not establish a fuel category.

`fuel_pricing` metadata records mode, category, actual GBP/L price, source and,
for weekly averages, observation/retrieval dates and snapshot ID. All alternatives
and legs carry the same quote. The route preview explains weekly average vs
manual vs configured fallback, and saved/shared route payloads retain their
original quote. Editing settings never reprices the displayed/saved journey or
starts routing/GPS. The next calculation uses the new selection. Multi-drop
responses previously emitted zero fuel costs; their total/leg fuel estimates now
use this same rate, without inventing toll/CAZ verification.

The `rv10` memory/persistent cache key includes a fingerprint of resolved fuel/
energy consumption, prices and quote metadata. A previous price/source/consumption
cannot replay its costs as a new quote; pre-migration cache rows miss safely.
Geometry, route ranking, avoidance and navigation eligibility remain under the
existing routing/verification logic.

**Operator integration, not deployment:** the app reads a snapshot only if
`VOYAGR_WEEKLY_FUEL_PRICE_CACHE` names the JSON file created by
`scripts/refresh-weekly-fuel-prices.py --cache-file /chosen/path.json`.
The parent directory must already exist; the web process needs read access and
the single refresher needs write access. No environment value, live cache,
scheduler, source refresh or production configuration was installed here.
Without a usable file the UI honestly reports a configured estimate. Live GOV.UK
HTTP acquisition and VPS/source/device acceptance still need verification before
claiming automatic prices are operational in production. Fuel Finder station
integration and real currency conversion remain separate future work.

Validation for step 2: 33 focused Python cases, including real Flask/cache wiring,
and 13 JavaScript selection/profile/provenance cases passed. The full declared
web backend selection passed 2,073 tests (one platform skip, 74 subtests);
142 JavaScript suites / 3,055 tests, lint and coverage requirements passed.
`node scripts/check-fuel-pricing-controls.cjs` exercised the real template controls
and production helpers at 390×844 and 844×390: legacy/manual/automatic changes,
reload persistence, no route/GPS/network side effects and no horizontal overflow.
This was controlled browser acceptance with fixture state, not live source,
full-map/device navigation or deployed data acceptance.
