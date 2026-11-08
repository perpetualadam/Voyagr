# Dynamic fuel-price research and staged integration

Researched 8 November 2026. Recommendation and implementation design only: no
runtime pricing, credentials, provider registration or production changes are
included. Preserve the existing Overpass, arrival and unit/device checklists.

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

## Repository findings

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
- [ ] Implement the weekly-average parser/snapshot/fallback layer with fixture HTTP
  first, then an opt-in automatic/manual request/UI contract in a separate review.
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
