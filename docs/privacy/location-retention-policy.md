# Proposed location retention policy and privacy architecture

Date: 2026-11-13. **Design proposal, not an activated production policy.**
Baseline/current behaviour is in [the inventory](location-data-inventory.md).
Only the access-control changes listed in the remediation report are implemented.
No existing database rows, recordings, backups or client histories are deleted.

## Responsibilities and boundaries

The browser owns continuous GPS processing, route progress, matching where
practical, instructions, preferences, offline recovery and local journeys. Send a
fix, bounded region or route only for the action requiring it: route calculation,
reroute, map/traffic/speed lookup or explicit reporting. Keep precision for those
operations; rounding away the useful coordinate is not the minimisation strategy.
Do not create a periodic server GPS-ingestion stream for ordinary navigation.

The app server validates transient requests, applies budgets/rate limits, proxies
necessary external calls, and returns results. Do not add account identity to route
requests or cache keys merely for convenience. Avoid raw query/body capture in
logs. The routing/lookup providers receive only their necessary fields, not the
account token, account UUID, entire trip history or dashcam metadata.

Local history is not a claim that no processing leaves the phone: provider lookups,
network IPs and query parameters still require an accurate privacy notice. Keep
public map-feature caching distinct from caching a private journey.

## Decisions requiring operator approval

### A. Private route caching — recommended design

1. Keep the existing durable active journey/local saved routes so offline and
   recovery capabilities are preserved. Add clear local-data controls in a later
   isolated UI change; do not clear device storage automatically in this patch.
2. **Stop new SQLite route-cache writes and disable reads from old persistent
   routes after an approved cutover.** Retain old rows untouched/quarantined
   pending a separately approved historical-data disposition. This is not erasure.
3. If server reuse is needed, use bounded memory-only cache instances. No disk,
   Redis persistence or backups for route bodies. Per-entry lifetime must not
   extend on hits. Proposed maximum TTL: **15 minutes**, measured from creation,
   not last access, using a monotonic clock for in-process expiry.
4. Partition private route responses by an opaque, short-lived browser capability,
   not account ID, IP address or rounded endpoint alone. Do not put this capability
   in URLs or logs. An unpartitioned or absent session must bypass private caching.
   A keyed digest of the canonical, complete route request can be used *inside*
   that scope; fresh per-worker keys avoid stable cross-restart identifiers.
5. No public route-cache listing, membership probe, private hit counter or stable
   client-visible cache identifier. HMAC obfuscation is defence in depth, not
   access control or anonymisation. Preserve every route-shaping/cost input and
   exact origin semantics; do not reintroduce waypoint/preference collisions.
6. Logical expiry and memory erasure are separate: reject expired reads before
   returning/copying data. Suggested implementation uses 14-minute expiry and a
   maximum 60-second removal sweep, targeting no more than 15 minutes' normal
   residence. Test untouched expired entries, overwrite, cancellation, capacity
   eviction, worker restarts and bounded memory. Scheduling cannot promise secure
   overwriting of RAM/swap; document host swap/core-dump controls separately.
7. Force-refresh and reroute must still bypass caches; decide explicitly whether
   fresh reroute results are cacheable. Default recommendation: do not cache
   automatic reroute responses. Copy envelopes before decoration so one request
   cannot mutate another request's cached response.

Alternative: entirely device-side route reuse with **no server route-body cache**.
This is simpler and avoids a new session capability, but increases engine calls,
latency and quota/load on repeated calculations. Existing short-lived public-map
caches can remain. Choose between these before changing route-cache behaviour.
Neither choice requires removing precise coordinates from functional requests.

### B. Account cloud synchronisation — recommended design

Default to local-only. Sign-in alone must not authorise uploading completed trips,
search history or saved-route snapshots. Provide separate, explicit, initially off
choices for (a) saved journeys/settings and (b) completed-trip/search history.
Do not infer opt-in from an existing account or silently upload an old local backlog.
Show what will upload and support pause, export, delete-cloud-copies and local-only
continued use. Keep owner validation and PostgreSQL RLS.

Existing cloud copies need a distinct migration/communication plan: stopping sync
must not silently delete them, and opting out must not keep uploading deletion
snapshots or unexpectedly rehydrate old data. Decide cross-device conflict and
deletion semantics before implementation. Do not add an account requirement to
navigation. These controls express product preference; lawful basis must still be
assessed for each purpose rather than assuming every operation relies on consent.

### C. Dashcam — recommended design

Start with device-only capture selected. Require an affirmative **per-recording
upload** action; recording/stop must not automatically imply server storage. A
separate choice must cover uploading GPS/speed/heading. Do not stream GPS metadata
to the server just because a local recording is running. Preserve current JWT/live
session checks, owner isolation, path safety, range streaming and no-store responses.
Do not claim device-only footage is durably saved until browser download/storage
has succeeded. Browser crash/memory pressure can lose an unfinished capture.

For newly uploaded clips propose a separate **7-day** server retention, starting
at successful upload completion, with earlier owner deletion. State whether users
may choose another documented duration. Schedule bounded cleanup for both video
and metadata, handle abandoned uploads/recording sessions and orphan sidecars, and
exclude private media/track data from generic route caches and public static paths.
Existing uploads, ownerless legacy clips, default audio recording and legal holds
need separate approval; do not silently purge or enable audio/GPS uploads.

### D. Historical data and backups — approval required

Inventory actual SQLite rows, files, PostgreSQL snapshots, Redis persistence,
provider exports and VM/object-storage backups through authorised operator review.
Take no blanket deletion action. Obtain approval for data classes and date bounds,
then dry-run counts and verification without printing precise locations.

Proposed backup responsibilities:

- Exclude temporary route bodies and caches from **new** backups. Use a consistent
  SQLite backup API rather than copying a possibly live WAL database file.
- Encrypt backup media and transport; tightly scope restoration credentials.
  Review S3 region, lifecycle expiry, noncurrent object versions and replication.
- Choose and publish a justified expiry (proposed 30 days for recoverable private
  records, not a statutory duration). Existing nominal yearly/monthly retention
  must not be replaced without operator approval and recovery review.
- Fix filename parsing/scheduling and test actual deletion deadlines independently
  of backup counts. Remove failed temporary copies under the approved policy.
- Use a minimal, separately protected deletion ledger/tombstone mechanism. Restore
  into isolation; keep application traffic off, replay subsequent erasures and
  consent withdrawals, strip temporary caches, verify, then reopen service.
- A backup containing erased data must remain beyond operational use until expiry;
  it must never silently restore that data into live use. Explain genuine backup
  limitations and time bounds to requesters. Legal holds need specific recorded
  justification and access restrictions, not a generic indefinite-retention claim.

No backup retention setting, restore operation or production schedule changes here.

## Proposed lifecycle matrix

| Data class | Target/default | Deletion enforcement and caveats |
|---|---|---|
| Live fix / command buffer | Current operation in memory | Drop superseded state; no replay queue or body logs. Provider retention is separate |
| Private server route response | None on disk; optional scoped memory <=15min | Fixed creation-based expiry plus bounded physical eviction; no sliding lifetime |
| Device active journey | Current journey/recovery intent | Guarded end/discard/replace; clear-device control. Preserve offline recovery |
| Device saved routes / recents | Local, user-controlled | Per-item and clear-all; count/age policy to be confirmed. Explain browser clearing |
| Cloud saved routes / history | Explicit opt-in only | Owner export and deletion; no upload backlog without confirmation; protect deleted copies from re-sync |
| Uploaded dashcam + GPS | Explicit upload, proposed 7 days | Atomic/incremental owner deletion, scheduled video + metadata cleanup; earlier manual delete |
| Speed feedback / spatial ML | No new identifiable telemetry without defined purpose | Decide coarse aggregated stats vs opt-in fine-grained records; current no-expiry rows need approval |
| Public map-feature data | Separate licence/freshness policy | No private request envelope/identity in shared feature caches |
| Application/proxy diagnostics | No route bodies/precise location | Structured allowlist; log only method/normalised route/status/duration/error category; IP retention justified separately |
| Backups | Proposed 30 days, awaiting recovery/owner review | Expiry across local/S3 versions/replicas, isolation and deletion replay on restore |

## UK GDPR assessment: requirements versus engineering choices

The legal principles require purpose-appropriate minimisation, justified retention,
privacy by design/default, appropriate security, transparency and support for
applicable access/erasure rights. There is **no general GDPR rule specifying a
15-minute route cache, 7-day recording or 30-day backup period**. Those are proposed
engineering choices which need necessity/risk and recovery justification.

| Principle / right | Assessment and required follow-up |
|---|---|
| Data minimisation / Article 5(1)(c) | Accurate coordinates can be necessary for navigation; global prediction disclosure and indefinite raw-cache retention are separate purposes. Remove unnecessary copies, not functional precision. Avoid collecting more identity merely to locate anonymous records |
| Purpose limitation / Article 5(1)(b) | Route performance does not automatically justify training/behaviour profiling. Historical cost prediction, community reports and analytics need separate purpose/lawful-basis assessment and notice |
| Storage limitation / Article 5(1)(e) | Serving TTL is not deletion; count limits are not time limits. Define lifecycle owner, scheduled enforcement, backup bounds and audit evidence |
| Design/default / Article 25 | Local by default and explicit cloud/upload controls reduce exposure. A signed-in profile with silent route upload does not meet this proposed product default |
| Security / Articles 5(1)(f), 32 | Preserve ownership, RLS, authentication and revocation checks; isolate private caches, minimise logs, review TLS and storage/backup access. Device storage and hashes remain vulnerable to compromise |
| Access / Article 15; erasure / Article 17 | Provide discoverable local/cloud export/delete paths, verify requests proportionately, cover all stores/processors and apply relevant exceptions. Backup restoration must not defeat completed erasure. Do not promise instantaneous forensic overwrite |
| Accountability / transparency | Operator must establish purposes, lawful bases, notices, processor contracts, transfer safeguards, complaint/contact details and a retention record. Evaluate whether high-risk systematic location/media processing needs a DPIA; tests cannot decide that legal question |

Consulted ICO sources (2026-11-13):
- [Data minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/)
- [Storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/)
- [Data protection by design/default](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-by-design-and-by-default/)
- [Erasure including backups](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-erasure/)

Some ICO guidance is being reviewed following the Data (Use and Access) Act.
Confirm applicable law and operational facts before making compliance claims.
Passing automated tests is **not** a GDPR compliance determination.
