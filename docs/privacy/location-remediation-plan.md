# Risk-ranked remediation plan

Date: 2026-11-13. Read with [inventory](location-data-inventory.md),
[proposed policy](location-retention-policy.md) and [threat model](location-threat-model.md).

## Execution boundary

The user authorised a read-only audit first, followed by low-risk independent fixes,
and required a pause for architecture decisions. The baseline was inspected before
modifying runtime code. Only the discrete disclosure fix below and its tests are
implemented. The remaining design is **proposed**, not silently activated.

No production database connection, historical data deletion, production migration,
retention configuration change, infrastructure change or deployment is authorised
or performed here. A pull request is not a production deployment.

## Completed isolated security fix

**R01 / High: protect historical-location diagnostics.**

- Apply the existing `VOYAGR_ADMIN_SECRET` gate to `/api/cache-statistics` and
  `/api/alternative-route-cache-info`. No configured secret fails closed (503);
  missing/wrong key, including ordinary bearer tokens, is refused (401).
- Require the same gate for **GET as well as POST** `/api/ml-predictions`.
  Previously GET returned a global list of stored route coordinates while POST
  was already admin-only. Keep the current handler for authorised operators.
- Mark success and denial responses `Cache-Control: private, no-store` and vary
  by the admin header. Keep those GET paths out of service-worker cache reads and
  writes, including offline replay. Existing cache copies are not erased here.
- Add regressions against actual Flask gates with temporary synthetic SQLite;
  preserve public cost calculation and route ingress. Keep the admin key out of
  production JavaScript. Update old tests which explicitly expected public ML GET
  to require the stronger protection instead.
- Add dashcam lifecycle regressions for metadata-row cascade, sidecar/video deletion
  and preservation of a second owner's clip under manual delete and cleanup.

**Effect:** normal routing, rerouting, route preview, cost estimates and local/offline
journeys do not call these diagnostics. Legacy global “smart predictions” will no
longer populate for ordinary users; its UI already ignores unsuccessful prediction
responses. That disclosure cannot safely remain as a public feature. If predictions
are wanted, rebuild them from local history or explicitly opted-in owner-scoped
history in a separate change. Server data and retention remain unchanged.

## Pending work, ordered by risk and dependency

| Priority / ID | Work | Dependencies / implementation risk | Verification before activation |
|---|---|---|---|
| High R02 | Stop indefinite private SQLite route caching; choose scoped memory-only <=15min or no server route-body cache | Operator architecture approval. Keep old rows untouched until separate approval. Changing cost prediction's historical input may change estimates; do not break fresh fuel/toll/CAZ calculation. More upstream requests/load possible | Cache expiry + untouched-key removal, no disk writes/read-back, two-client isolation, complete waypoints/preferences/cost keys, origin-integrity and route/reroute tests |
| High R03 | Close residual location/URL exception sinks in search, road-info, weather/traffic and observability | Independent code work can follow this PR; proxy/CDN policy needs operator approval. Preserve fallback and generic status handling | Adversarial exception messages with coordinate/address/key sentinels; capture structured records/stdout/stderr; normal and fallback response tests; separate authorised proxy-log validation |
| High R04 | Explicit local-default cloud controls for journeys/settings/search history | Approval for existing-account migration, separate feature controls, cross-device deletion semantics. Never upload backlog silently. Existing cloud data retained pending decision | Signed-out, signed-in-without-opt-in and opt-in cases; account changes, revoked session, queued async operations; offline local saved journeys |
| High R05 | Device-default dashcam with per-clip upload and separate GPS upload choice | Approval of UX/default audio/GPS and new-upload retention. Avoid capture loss or unintended auto upload; retain strict session ownership | Browser MediaRecorder/microphone cleanup, local stop without network, explicit upload success/failure/retry, metadata isolation, anonymous/cross-owner/revoked auth and owner deletion |
| High R06 | Fix and enforce backup expiry plus restoration erasure ledger | **Separate approval:** time bounds, replicas, recovery objectives, external storage and historic purges. Current cleanup error and restored deleted row are evidenced | Synthetic backup filename matrix, WAL-safe consistent copy, expiry at boundaries, remote lifecycle integration on disposable bucket only, quarantine restore and deletion replay |
| High R07 | Verify private auth bypass/proxy trust and applied PostgreSQL RLS/session RPC | Live config inspection/change requires specific authorisation; do not infer from repository defaults or run migrations | Non-loopback and proxied unauthenticated requests denied, account A/B RLS, session revocation, missing authority fail-closed, no production data used |
| Medium–High R08 | Subject access/erasure/export across SQLite, Postgres, uploaded files, clients and processors | Identity verification without collecting extra location/identity; clear legal holds and backup delay. Ownerless legacy data needs operator process | Another user cannot export/delete; own data complete; erasure propagates without re-sync/restore resurrection; maintain other owner's data |
| Medium R09 | Minimise speed feedback/spatial ML and community report metadata; physical expiry | Approval of exact versus coarse/aggregate purposes and historical-data disposition. Do not delete the public map/camera dataset | No silent new telemetry, expired report physically removed under approved policy, bounded aggregates, free-text moderation/minimisation |
| Medium R10 | Bound remaining lane/lookup/device cache retention; respect no-store across SW | Changes can affect offline speed/map behaviour; distinguish map tiles from private queries. Never clear saved routes indiscriminately | Stale keys never served, bounded storage, background/restore/cancel and offline regression tests, explicit local clear preserves unrelated data |
| Medium R11 | Processor/transfer/legal documentation and user notice | Operator identity, lawful bases, actual self-hosted/provider URLs, contracts, DPIA necessity and ICO obligations need facts/legal assessment | Honest layered notice, working contact, processor inventories, retention schedule and documented rights workflow; test success is not a legal opinion |

## Approval options — stop before implementing these choices

1. **Recommended:** device-first journey storage, disable future persistent route-cache
   reads/writes, optional capability-scoped memory cache <=15min; explicit separate
   cloud-sync opt-ins; device-default dashcam and explicit clip/GPS uploads. Existing
   records stay untouched pending an approved deletion plan.
2. **Simpler stricter route-cache variant:** same device/cloud/dashcam rules but no
   server route-body cache at all. More routing calls and potential latency/quota.
3. **Transitional variant:** initially block further persistence but leave old data
   inaccessible to normal route lookups while validating performance. Still requires
   follow-up erasure policy; quarantine is not deletion.

Please approve a route-cache variant and the proposed cloud/dashcam default changes
before R02/R04/R05 implementation. Backup expiry and any historical purge require
separate approval of concrete data classes, scope and recovery consequences. No
approval is inferred from elapsed time or from this document.

## Rollout and rollback

Publish and review the small R01 PR separately. Deploy only when the operator
requests it. Do not re-open historical route disclosure as a rollback shortcut.
For later phases, stage feature controls against synthetic data, measure engine load,
verify no private cache writes, then request approval for the concrete deployment.
A rollback must not resume silent uploads or restore erased records. Freeze legacy
stores without deleting them if a migration fails; never break offline local
recovery to implement server retention.
