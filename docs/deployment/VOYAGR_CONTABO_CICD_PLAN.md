# Voyagr — Contabo deployment discovery and CI/CD plan

Date: 2026-10-27. Repository evidence baseline: main `8010165282c60aaa5ba9e0f8f6518a1356ee5448` (Phase 4 merged). Phase 5 PR #341 was not part of main at discovery; its proposed changes must not be assumed deployed. **Proposal only: no executable workflow, server configuration, credentials or production data changed. No VPS connection, public service probe, deployment or restore was performed.** Overall application production-readiness remains NO-GO under the existing audit acceptance gates.

## 1. What the repository establishes

This is source/configuration discovery, not an inventory of currently running servers. Templates, historic guides and effective systemd/Nginx/container configuration can differ. Addresses below are referred to by role; operator must confirm targets rather than copying an old IP from a script.

| Component | Repository evidence | Finding / confidence |
|---|---|---|
| Main web application | `deploy/voyagr.service`, `deploy/setup-contabo.sh`, `CONTABO_UPDATE_COMMANDS.md` | Documented deployment is `/opt/voyagr`, Python virtualenv `venv`, systemd `voyagr`, Gunicorn `voyagr_web:app` as `voyagr:voyagr`, bound to **127.0.0.1:5000**. Template uses 4 workers × 4 threads, timeout 120 s / graceful timeout 60 s. Effective drop-ins/version unknown. |
| Front proxy | `deploy/nginx-vibevoyager.org.conf`, `nginx-voyagr.conf`, security/tile snippets | Nginx fronts Gunicorn; canonical-domain template terminates TLS, redirects HTTP, proxies maps/static/API and applies rate/body limits. Older template has HTTPS commented out and a different map upstream. Active vhost, DNS/CDN and certificate state unverified. |
| Separate maps server | Canonical Nginx template header and `voyagr_tileserver_gb` upstream | Explicit **VPS1 app + VPS2 maps** topology; VPS2 tile service documented on 8088, distinguished from Nominatim on 8080. Older Nginx template proxies the app host instead: reconcile before automation. Running tiles/geocoding services and persistence not verified. |
| Valhalla | `deploy/setup-valhalla-contabo.sh`, `CONTABO_VALHALLA_SETUP.md`, `valhalla.json` | A **Docker container named valhalla**, normally on app host, port 8002, bind mount `/opt/valhalla/tiles:/custom_files`. Setup uses mutable `latest` image and downloads/builds GB graph data. This is not proof of installed image/graph. |
| GraphHopper | `deploy/check-routing-engines.sh`, `deploy/deploy_camera_areas.sh` | App/service defaults localhost:8989; scripts reference `/opt/graphhopper`, `config.yml`, custom camera areas and `systemctl restart graphhopper`, with Docker fallback. Actual runtime, graph-cache path and build/profile must be confirmed. |
| Supabase | `supabase-selfhost/docker-compose.yml`, `setup.sh`, `nginx-supabase.conf` | Minimal Compose stack: PostgreSQL `15.6.1.120`, GoTrue `v2.158.1`, PostgREST `v12.2.3`, Kong `2.8.1`. These are declared tags, not live version/digest evidence. Setup explicitly refers to the **main Voyagr VPS as another server**; proxy snippet instead assumes local Kong. Supabase may be on VPS2 or a third host, or cloud; unknown. |
| Redis | `deploy/setup-redis-rate-limits.sh` | Optional systemd Redis bound to loopback for shared rate limits. Installation/use/persistence policy unknown; do not restart it per app release. |
| Other app container option | Root `Dockerfile`, `.dockerignore` | An alternative Docker image exists, but runs `python voyagr_web.py` and has no demonstrated production app Compose service. **Do not replace the evidenced systemd runtime with Docker.** |
| Current GitHub deployment workflow | `.github/workflows/contabo-deploy.yml` | Despite its name, only prints manual instructions. It triggers on main push/manual dispatch and has `needs: []`; it **does not wait for CI success**, SSH, restart services or deploy. Its comment suggesting “after CI” is not an enforced dependency. |
| CI | `.github/workflows/ci.yml` | Main push / PR CI runs frontend lint/Jest/coverage, selected Python behavior tests and isolated dashcam session-policy SQL tests. These checks are needed but do not prove deployed provider/auth/proxy safety. |

**Server count:** at least two roles are explicitly documented; a separate Supabase host is contemplated. The exact current number of Contabo instances, co-location, private networking and host identity cannot be established from the repository. No host was contacted to resolve this.

## 2. Current manual update procedure and gaps

The documented operator sequence is:

```bash
# Existing procedure shown for discovery; not executed in this task.
cd /opt/voyagr
sudo bash deploy/deploy-pull.sh
```

`deploy-pull.sh` requires root, trusts the configured app directory, registers it as a root Git safe.directory, fetches/pulls `VOYAGR_DEPLOY_BRANCH` (default main), then runs `setup-voyagr-user.sh --permissions-only --restart`. That helper recursively changes ownership of the **whole checkout** to the application account, adjusts runtime/credential file permissions and restarts `voyagr`. In permissions-only/restart mode it does not verify readiness afterwards. The deploy script prints a curl/status suggestion rather than enforcing it. The simpler documented alternative is `git pull origin main` followed by restart/status.

Consequences:

- No exact SHA, clean-tree requirement, immutable dependency set, deployment lock, database backup gate, readiness acceptance or automatic rollback. Git pull may merge/diverge or encounter operator edits. Do not automatically stash/discard those edits.
- Pulling source in place exposes mixed old/new files and assets to active workers. A restart failure leaves the changed checkout installed. A shell interruption can leave a partial update.
- Routine deploy does **not** install changed Python requirements, run asset sync, install a changed unit/drop-in or reload Nginx. A pull/restart alone is insufficient for those changes.
- `setup-contabo.sh` is bootstrap, not a safe repeatable update: it installs packages, creates/reuses a venv, rewrites `.env`, generates an API key, installs the unit and replaces Nginx configuration. Never put it into an automatic release job.
- `supabase-selfhost/setup.sh` generates credentials and prints generated keys; it must not be used in CI logs or app deployments. Do not rerun bootstrap/key-generation helpers during promotion.

| Changed material | Proposed release action after separate review |
|---|---|
| Python/templates/browser assets | Prepare complete isolated release and its venv/assets; controlled Gunicorn service restart or reviewed reload after cutover. Restart is initial recommended behavior, with a brief maintenance/drain window. |
| Python dependencies / native libraries | Build/test per-release environment from locked, hashed dependencies compatible with VPS OS/architecture. No root pip or shared in-place venv upgrades. OS library changes are separate maintenance. |
| Browser/vendor assets | Preserve/test `static/vendor` bundles, Picovoice files and service worker cache/version behavior. CI currently uses `npm ci --ignore-scripts`; Dockerfile explicitly expects pre-synced voice assets. Explicitly build/validate required assets before sealing the release. |
| systemd unit/drop-ins | Separate privileged configuration change; validate, `daemon-reload`, controlled restart. App promotion must not install arbitrary repo-supplied units as root. |
| Nginx/TLS | Separately approved config change; back up config, syntax-test and reload. No restart/reload for ordinary app changes; preserve existing TLS/DNS/Cloudflare settings. |
| Valhalla/GraphHopper binary/config/graph | Separate engine maintenance job, pinned image/binary plus immutable graph identity; verify capabilities and rollback graph compatibility. No app-release graph rebuild or blanket engine restart. |
| Supabase/Redis/maps/geocoding | Independent service lifecycle; do not Compose-up/recreate/migrate/restart these on each web release. Coordinate only explicit changes with owners and verified backups. |

## 3. Persistent data: strict exclusion from release replacement

| State | Evidence / preservation requirement |
|---|---|
| Web SQLite | `voyagr/config/settings.py` hardcodes **relative** `voyagr_web.db`; models and dashcam share it. Preserve trips, accounts/ownership/settings, cameras, recordings metadata and caches. Preserve SQLite WAL/SHM behavior; never package an empty DB or restore a DB from Git. |
| Private recordings | `dashcam_service.py`, blueprint and permission helper use relative `dashcam_recordings/`, including hashed owner directories and legacy NULL-owned/quarantined data. Never delete, upload publicly, reattribute or overwrite recordings/metadata during a release. |
| Other SQLite/model state | Legacy `satnav.py` references `satnav.db` / `voyagr.db`; inventory any other `*.db`, SQLite files, model/user-generated datasets and scheduled jobs on the host. Their live use is unknown, so classify before cleanup. |
| Runtime secrets/configuration | Existing `.env`, `.api_key`, administrative-secret backup files, Supabase environment/generated-key files, OAuth/provider/payment credentials, and SSH/cert material. Preserve outside release artifacts; no logging or artifact upload. TLS private keys remain under operator-managed certificate paths. |
| Supabase PostgreSQL | Compose logical volume **supabase-db-data** mounted at `/var/lib/postgresql/data`. Actual engine volume name is Compose-project-qualified and must be recorded. Auth users/sessions and application/RLS data must survive app releases. Never `docker compose down -v`, volume prune or initialize a new empty volume inadvertently. |
| Supabase config/init SQL | Kong config is a read-only bind mount. `volumes/db/init/*.sql` exists, but current Compose does **not** mount that directory as an init directory. SQL presence does not prove application, nor do init scripts rerun against existing databases. Reviewed dashcam session RPC/schema state must be verified explicitly. |
| Routing data | Valhalla `/opt/valhalla/tiles`, configured tiles/traffic extracts and optional `/opt/valhalla/traffic` CSVs; GraphHopper actual graph-cache, PBFs, custom areas/config/models under its confirmed paths. Persist/snapshot by graph version, never replace during an app deploy. |
| Maps/Nominatim | Tile MBTiles/style/fonts/sprites and geocoder DB/volumes on the confirmed maps host; paths/volumes are not established by this repo. No wildcard synchronization or cleanup there. |
| Redis/logs/backups | Confirm Redis persistence role before treating as disposable; preserve audit/deployment records and log rotation. Backups belong outside release paths and require access control/encryption/retention. |

### Required filesystem preparation before immutable releases

Proposed layout (not installed): `/opt/voyagr/releases/<full-sha>/`, a managed `current` pointer, a durable `shared` directory, root-owned deployment helpers and an append-only deployment ledger outside release cleanup. Application code/venvs must be read-only to `voyagr`; host configuration/secret files should be operator/root-owned and runtime-readable without runtime write permission. Only explicitly selected shared data directories are writable. Build identity, SSH deployment identity and runtime identity must be separate.

A symlink switch alone is **not safe with the current relative SQLite and recording paths**: it could create a fresh DB/recordings directory inside every release. Plan a separately reviewed path migration first. Prefer absolute configurable state paths under shared storage; alternatively carefully verified compatibility symlinks require both directory/WAL permission and startup tests. Do not move live state in this documentation task. `.env` loading and secret backup resolution must also be tested against the new layout.

Application import executes `init_db()` and dashcam initialization with schema changes. A candidate startup is therefore potentially a database migration, not a harmless health probe. Prevent unreviewed import-time migrations against production; validate migrations on staging/copies and gate the exact schema operation before candidate startup. Two versions must not concurrently mutate an incompatible schema. Until that is resolved, prefer a maintenance-window single-writer promotion over claiming zero-downtime blue/green.

## 4. Proposed promotion transaction: one exact release

1. **Identify:** immutable full 40-hex Git commit, repository, successful CI run ID/attempt, artifact SHA-256 digest, builder/toolchain/dependency manifest, graph compatibility and schema requirements. A branch/tag alone is not an identity. Record prior accepted release.
2. **Authorize:** verify CI completed successfully for that **same SHA**, same repository, main push (not a fork/PR event), permitted main history and required policy/checks. Check all required jobs, not merely an arbitrary check named CI. Validate again after waiting for environment approval. Older candidates must not accidentally replace newer releases; require expected-current identity and ancestry policy, with explicit audited rollback exception.
3. **Build once:** trusted CI build exports only allowlisted tracked source plus deliberately built assets; excludes all DBs, recordings, env/key files, logs and backups. Resolve/hash transitive dependencies and preserve wheel/artifact compatibility. Existing requirements pins are not a complete hashed dependency lock. Attest provenance/digest; promote the same artifact/digest through staging and production. Do not build production by pulling moving `main`, mutable `latest` images or unauthenticated artifacts.
4. **Lock:** acquire a **host-wide `flock`** in a durable root-controlled lock directory, covering manual and automated deployments, migrations, pointer change and rollback. Separate environment locks only when state/services are genuinely isolated. Recheck expected-current release and free disk/inodes after locking. A GitHub concurrency group alone does not lock SSH sessions or other repositories.
5. **Prepare:** fetch verified artifact into a temporary path on the release filesystem, verify digest/provenance, reject archive traversal/symlinks escaping release, create isolated environment as unprivileged build identity, verify assets/config references, then atomically finalize the immutable release directory. No archive extraction/dependency installation as root. Do not pass production secrets to build scripts.
6. **Protect data:** require verified backup status and migration compatibility before **any** candidate import/mutation. For migration/write-stop changes, drain/reject writes/uploads (including an explicit active-recording and in-flight upload policy; abort promotion rather than truncate recordings) and quiesce relevant background tasks, take a coordinated backup, check it, then run only the approved migration identity. If no verified backup or compatible rollback exists, abort before cutover.
7. **Validate candidate:** use staging or an isolated candidate with sanitized state. A production-bound preflight must not duplicate background jobs, retention tasks, payments/email or import-time migrations. Reuse existing private/loopback networking; no new public ports.
8. **Cut over:** record transaction phase, old/new release and schema/backup identifiers; atomically replace the current pointer on the same filesystem (not a sequence that leaves it missing), restart only the fixed approved web unit, then run bounded acceptance checks. Service unit must use the proposed stable release/runtime paths, installed separately by an operator.
9. **Accept or roll back:** mark accepted only after all required checks pass. On failure, restore the previous pointer/config and previous per-release environment, restart, verify rollback, alert operator and stop further promotions. Never silently continue after a failed rollback. Retain old releases/backups until agreed retention and recovery windows expire.
10. **Recover interrupted runs:** persist transaction state before each mutation; a root-owned supervisor/job resumes acceptance or rollback after runner/SSH loss. Do not rely solely on an SSH shell `trap`, GitHub cancellation handler or job timeout: these can disappear while the server keeps running. No deployment is complete merely because SSH returned zero.

Routine promotion never invokes bootstrap scripts, blanket recursive chown, `git reset --hard`, `git clean -fdx`, `rsync --delete` over shared paths, Docker volume removal, graph rebuilds or credential generation. If deploying a checkout rather than an artifact during an interim stage, fetch/verify the supplied SHA and detach into a **new** release directory, assert HEAD equals that SHA, and use that same directory's immutable environment; never update the live tree with `git pull`.

## 5. Backup and rollback safeguards

- **SQLite:** use SQLite online backup API / `.backup` for a transactionally consistent database snapshot; do not copy a busy main file and ignore WAL. For a consistent DB-plus-recordings recovery point, coordinate write/upload/retention pause and include matching media plus ownership metadata. Record backup checksum, schema version, timestamp, size, encryption/retention and restore-test evidence. Run integrity checks on the backup, not broad disruptive scans on live traffic.
- **PostgreSQL:** operator-owned logical backups (`pg_dump` plus required roles/grants) and/or tested physical/PITR coverage as appropriate, with version compatibility, encryption, separate failure-domain storage, RPO/RTO and a successful isolated restore drill. No passwords in command lines/logs or dumps as GitHub artifacts. `pg_isready` alone does not verify a backup or usable schema.
- **Code rollback is not database rollback.** Additive migrations must support the previous release during the rollback window. Destructive/incompatible migrations are excluded from routine automation and require a separate approved maintenance/restore plan. Never automatically restore a backup over newly written user data; data restoration requires operator reconciliation and explicit authorization because it can lose post-backup writes.
- **Engine rollback:** preserve previous binary/image digest plus matching graph/config/extract, and deploy as a separate transaction. An app rollback must not change Supabase/graph volumes. No rollback can claim correctness if the old code cannot read the new schema or auth policy.

## 6. Health and acceptance checks

Every check needs a bounded timeout/retry count and machine-readable pass criteria; logs should contain sanitized error types, release IDs and statuses, not tokens, recordings or user coordinates. Use synthetic operator-approved fixtures and dedicated test accounts, not arbitrary live user data. No paid provider probes without approval.

| Layer | Existing evidence / proposed criterion |
|---|---|
| Service/process | `systemctl is-active voyagr` and effective User/PID are useful but insufficient. Confirm all expected workers start, no restart loop, and accept requests over an agreed stabilization window. |
| App + DB | GET loopback `/api/app-settings`: require HTTP 200, JSON `success:true` and expected fields. This endpoint can return HTTP 200 with success:false, so checking the HTTP code alone is inadequate. Never POST settings as a health test. |
| Release identity | Existing `/api/deployed-version` exposes commit and service-worker version. It reads mutable `.git` per request, so after in-place pull it can claim new files while an old worker still runs; source archives have no `.git` and yield null. Propose an immutable manifest identity captured at worker startup plus noncached response, compare against expected full SHA/digest, and verify every worker consistently reports it. Do not treat current endpoint as proof of executing code identity. |
| TLS/proxy/assets | Use the operator-confirmed existing HTTPS origin with certificate verification, correct Host/SNI and no credential-bearing redirects. Validate root HTML, expected JS/vendor assets and service-worker no-store behavior; ensure no DB/env/recording directory is reachable through static/Nginx routes. Distinguish CDN-cached responses from origin checks. |
| Engines | Existing `check-routing-engines.sh` has Valhalla status/sample route and GraphHopper sample route. Its substring checks are only a starting point: parse JSON, validate nonempty geometry/endpoints/profile/source and fixture constraints. Do not accept an OSRM recovery as evidence that required local engines passed. Full enforcement remains a separate graph-backed gate. |
| Maps/geocoding | Check style JSON plus representative referenced tile/font/sprite through the existing proxy and an approved synthetic geocode; a reachable style URL alone is not usable navigation. Confirm the maps host dependency separately. |
| Auth/private access | Readiness of Kong/GoTrue/PostgREST and schema/RPC availability, then preapproved isolated/two-account checks of session revocation and private recording denial. Use operator-owned test identities and sandbox media; never embed service-role keys in app probes or destroy live recordings. No simple public liveness check establishes dashcam security acceptance. |
| Database/Redis | PostgreSQL readiness + schema/version and permission checks; shared limiter storage ping/behavior if required. Report a missing optional service distinctly from required readiness; never weaken rate/auth gates merely to pass promotion. |

First add a lightweight dedicated liveness/readiness contract in a reviewed implementation task; it should not make expensive/paid calls per request or expose secrets. Deployment acceptance may separately exercise approved fixtures once. Define critical versus optional dependency failures beforehand; unrelated pre-existing external outages must not cause destructive schema restores or indefinite rollback/retry loops.

## 7. Secure GitHub-to-server connection

- One dedicated deploy SSH identity per environment and target role, **not root**, not a personal operator key and not the runtime `voyagr` user. Generate/store the private key securely; later add it only as a protected environment secret. No key or secret was generated, requested in chat or installed here.
- Authorized key should force a **root-owned dispatcher** with `restrict` (no PTY, forwarding, agent/X11 forwarding or user rc), and an explicit fixed command such as `/usr/local/libexec/voyagr-deploy-dispatch`. Ensure the user's shell permits that forced command; a blanket nologin shell can also prevent it. Key holder cannot obtain a shell, choose arbitrary directories/units, run sudo bash, upload arbitrary executable helpers or join the Docker group (effectively root).
- Dispatcher accepts a strictly parsed protocol: fixed application/environment, SHA, digest, approved CI run identity and expected prior release. Reject unexpected arguments, shell syntax and invalid identifiers; never `eval SSH_ORIGINAL_COMMAND`. All paths/services/privileged operations are fixed in the installed policy, not supplied by workflow input.
- If privilege is needed, sudo permits **only** the root-owned helper's fixed validated operation. Never grant wildcard `systemctl`, `bash`, `pip`, `git`, `tar`, arbitrary scripts from the checkout or writable service-unit execution as root. Runtime user must not be able to replace code a privileged helper later executes.
- Artifact fetching uses a separate, repository-scoped **read-only** credential or verified delivery mechanism, with provenance/run/digest verification. SSH deployment credentials are not reused as a writable GitHub repository credential. A forced-command key cannot also be assumed to provide general SCP/SFTP; if delivery requires that, design a separately restricted upload-only path/identity and verification boundary. Prefer server retrieval of a verified artifact under the dispatcher.
- Pin **full SSH host public keys** in a dedicated known_hosts file; operator verifies their SHA256 fingerprints out of band through the trusted Contabo console/current trusted inventory. Use `StrictHostKeyChecking=yes`, `UserKnownHostsFile`, `IdentitiesOnly=yes`, `BatchMode=yes` and bounded connect/keepalive settings. Do not use accept-new, disable host verification or trust a fresh `ssh-keyscan` result without independent comparison. Plan key rotation with explicitly approved old/new pins.
- Use existing SSH/VPN/bastion reachability; do not open new public application/DB/engine ports. Hosted runner egress is variable: operator must choose an existing controlled network path or isolated trusted deploy runner, not widen the VPS firewall indiscriminately. Never run untrusted PR code on a production-connected self-hosted runner.
- No `set -x`, environment dumps, raw auth headers, generated key output or sensitive DB/SSH logs in Actions. Ephemeral runner key/known_hosts files get restrictive modes and are removed; runner cleanup is not the server transaction recovery mechanism. Rotate/revoke deploy keys and keep deployment/audit alerts.

## 8. Proposed GitHub workflow — not enabled

Recommended rollout: first a manual **staging-only** workflow selecting an eligible SHA; later CI-success staging promotion; production remains manual environment-approved promotion of the **same attested artifact** until a separate authorization enables anything further. The current reminder workflow stays unchanged by this task.

Future implementation shape (illustrative policy, **not a runnable workflow**; all action references must be reviewed immutable full commit pins, not invented placeholders in an enabled job):

```yaml
# Proposed future file, NOT created: .github/workflows/promote-voyagr.yml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
permissions:
  contents: read
  actions: read
concurrency:
  group: voyagr-promotion
  cancel-in-progress: false
jobs:
  validate_candidate:
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.head_repository.full_name == github.repository
    # Verify run/check policy/repository/SHA/attested digest and produce outputs.
    # Never interpolate an event string directly into a shell command.
  staging:
    needs: validate_candidate
    environment: staging
    # Pinned trusted actions and fixed dispatcher; exact validated artifact.
  production:
    needs: [validate_candidate, staging]
    environment: production
    # Requires protected-environment operator approval; SAME artifact SHA/digest.
    # Remains absent/disabled until separately authorized and safeguards installed.
```

Implementation requirements beyond this sketch:

1. Configure `staging`/`production` protected GitHub environments with named reviewers, prevent self-review, restrict deployment branches to main, and prevent bypass where supported. Confirm repository plan/permissions actually enforce this. A YAML environment label is not protection by itself. Verify branch rules/required CI checks; do not change them in this task.
2. Keep privileged deployment orchestration on a trusted protected revision. `workflow_run` can access secrets even when upstream workflows cannot: exclude forks/PR runs, verify upstream identity and never execute untrusted downloaded workflow/artifact scripts with credentials. Minimize token permissions; add short-lived OIDC/attestation permissions only to the specific build/verify job that needs them. No write-all token.
3. Validate candidate SHA from the successful run, not `github.sha` of the downstream workflow or latest main. Build on trusted CI from that SHA; bind run ID/attempt/repository/digest/provenance. Fail if artifacts expired, provenance differs, required checks are missing or candidate is no longer eligible.
4. Environment-scoped variables later: confirmed target/port/user, host-key pins, expected origin/service/release paths and policy identifiers. Environment-scoped secrets later: dedicated SSH private key and any narrowly required artifact retrieval binding. Production application/Supabase/payment secrets stay on the host, not in release artifacts or routine Actions jobs.
5. Serialize promotions with cancel-in-progress=false; account for GitHub pending-run replacement/ordering (it is not a FIFO deployment queue). Revalidate expected-current release on the server and reject stale work. Host transaction lock/recovery remains authoritative even after runner loss.
6. Set bounded job/SSH/health budgets consistent with Gunicorn/proxy drain times and backup/migration duration. Do not impose a runner timeout that kills supervision before rollback can finish. Record an outcome even when rollback fails, then alert and block further promotion.

## 9. Staging before production

A staging environment is feasible as a **proposal**, not evidenced as already provisioned. Prefer a separate VPS or otherwise strictly isolated state/identity. If existing capacity requires co-location, use separate service account, release/shared paths, virtualenv, database/recording storage, Supabase project/stack and credential namespace. Separate PostgreSQL/Compose project plus correctly mapped external volume identities prevent accidentally attaching production data; do not launch a staging Compose project in a new release directory against ambiguous volumes.

Expose staging only through an approved existing private path or authenticated route on the existing HTTPS ingress; DNS/TLS changes need operator approval. No new public ports. Read-only shared routing graphs may be considered only after capacity/compatibility review; staging must never restart/rebuild production engines or run paid update jobs. Use synthetic/sanitized data, separate OAuth redirects/cookies, test payments/email sinks, disabled production schedulers/retention/export jobs, and dedicated media. Do not use a live production DB as the candidate's startup test. Prove backup/rollback and concurrency/SSH-loss failure drills in staging first.

## 10. Security risks requiring resolution

| Risk found in source | Required control before enabling deployment |
|---|---|
| Root script executes helpers from an app-owned mutable checkout | Root-owned narrow dispatcher, immutable read-only releases, separate build/runtime/deploy identities |
| Whole-tree chown and in-place pull | Separate shared state and staged releases; preserve local changes; no broad cleanup |
| Bootstrap overwrites env/generates credentials | Exclude bootstrap/rotation from promotion; host-owned config lifecycle |
| Mutable tags / transitive dependency drift | Pin image digests/build inputs; verified artifact provenance, complete dependency hashes |
| Minimal Supabase Compose publishes Kong on all interfaces, while proxy snippet assumes loopback | Operator must verify actual binds/firewall/TLS topology; no port changes performed here |
| Valhalla setup publishes 8002 without explicit loopback bind | Confirm actual isolation/firewall. Do not rerun setup or expose routing engines for CI |
| Nginx host/upstream templates disagree | Confirm active vhost/map endpoint/DNS before any config promotion |
| Nginx templates cap bodies at 1 MiB while dashcam upload default is 200 MiB | Reconcile intended proxy/upload policy with authenticated scoped uploads; do not globally enlarge body limits as a deployment shortcut |
| Import-time SQLite migrations and unverified Supabase RPC application | Backup/schema compatibility gate and isolated restore/migration drills |
| Existing version probe reads mutable disk, readiness only suggested | Startup-bound immutable identity plus all-worker/readiness/functional acceptance |
| Docker alternative uses broad COPY and is not evidenced production runtime | Do not adopt it by default; if later chosen, audit context allowlist, private media/env/key exclusions and runtime user/server independently |
| GitHub environment/network controls not yet verified/configured | Confirm reviewer/branch enforcement, host pins, restricted SSH and runner path before provisioning any key |

This plan does not declare these templates to be the live server configuration or claim a breach. Existing lane/speed/avoidance/device and dashcam deployment-security acceptance gates remain separate release blockers even after CI/CD engineering is complete.

## 11. Exact operator information still required

Provide **configuration facts and public host keys/fingerprints through approved inventory**; enter private credentials only through secure environment/server settings, never chat or Git:

1. **Inventory:** each Contabo instance's role, approved host alias/address/SSH port, OS/architecture/resources, private links/bastion/VPN and deployment owner. Which host runs app, Nginx, maps/Nominatim, Valhalla, GraphHopper, Supabase and Redis? Is Supabase cloud or self-hosted?
2. **Effective app runtime:** sanitized `systemctl cat/show` facts (unit/drop-ins/User/WorkingDirectory/ExecStart/EnvironmentFile paths, not env contents), actual checkout/venv path, active commit, local modifications, current restart/drain policy and background services/timers/cron. Confirm whether any app Docker runtime actually exists.
3. **State inventory:** resolved SQLite/recording paths and ownership, all databases/media/models, symlinks/mounts, retention tasks; exact Supabase Compose project/volume/bind names, PostgreSQL version/data path; engine image/binary digests/profiles/graph/traffic paths and dates; maps/geocoder/Redis persistence. No secret values needed.
4. **Ingress:** active Nginx site/includes and upstream roles, canonical HTTPS origin, DNS/CDN/proxy rules, certificate owner/renewal, upload limits, static/private storage isolation and existing permitted deployment network path. Resolve the two map and Supabase topology descriptions.
5. **SSH trust/access:** independently verified host public keys and SHA256 fingerprints, approved dedicated deploy account/forced-command/sudo policy, key generation/rotation/revocation owner, permitted runner source path and artifact retrieval mechanism. No private key in the plan.
6. **GitHub controls:** authorized environment reviewers, anti-self-review/bypass/branch rules, required check names, Actions/attestation/environment features available on the plan, repository access and intended promotion/approval policy. No secrets/settings changed during discovery.
7. **Backup/recovery:** backup location/owner/encryption/retention, last successful SQLite+media/PostgreSQL restore drill, allowed RPO/RTO/downtime, prior known-good release and schema compatibility. Identify who may authorize any data restore.
8. **Migrations:** effective SQLite and Supabase schema/RLS/session-RPC versions, import-time migration behavior and reviewed forward/backward compatibility plan. Which changes may run automatically, and which require a maintenance window?
9. **Acceptance:** approved synthetic route/engine/map fixtures, critical dependency policy, expected readiness/worker count/timeout thresholds, sandbox auth/media accounts and who receives failure/rollback alerts. Are paid probes explicitly permitted? Default is no.
10. **Staging:** available host/capacity/private access, sanitized fixtures, separate Supabase/credential/OAuth/payment/email identities and whether shared read-only graphs are acceptable. Define a rollback/SSH-loss/concurrent-deploy drill before first production promotion.
11. **Build/release policy:** supported Python/Node/OS versions, complete dependency lock/hashes, required generated/vendor assets, artifact retention/provenance verifier and immutable identity strategy. Approve startup-bound release reporting and shared-state path changes before implementing them.

## 12. Implementation proposal and validation status

Future, separately authorized work: add tested state-path/startup identity/readiness support; build immutable artifacts; implement root-owned server dispatcher/transaction/lock/rollback and narrow SSH policy; provision isolated staging; add an initially staging-only protected workflow with full action pins; rehearse failures and restores; then seek explicit authorization for production promotion. Proposed script/workflow paths above are not created or enabled by this change.

This task changes **only this Markdown plan**. Source references and local relative links were checked; no application/runtime behavior changed, so Python/Jest/SQL suites were not rerun for this documentation-only change. No server commands in the plan were executed. Hosting CI may still run its normal regression workflow for the documentation PR; report its outcome separately, without treating it as a staging/production deployment test.
