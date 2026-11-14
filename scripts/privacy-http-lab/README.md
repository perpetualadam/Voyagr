# Disposable privacy HTTP integration lab

This harness adds real HTTP integration verification to Phase 4. It does not
deploy Voyagr, enable cloud sync, or validate a production installation.

## Run on an isolated VPS checkout

Requirements: Docker CLI/daemon, Python 3, internet access for public image and
dependency downloads, approximately 3 GiB available memory plus image disk space.
No host Node, PostgreSQL or additional Python packages are required. Git selects
tracked application source and public assets.

```bash
python3 scripts/privacy-http-lab/run.py
```

Run only from the reviewed candidate checkout. The harness never accepts a DSN,
existing Docker network, existing volume, API token or production environment file.
It uses these public images: PostgreSQL 15 (Debian Bookworm), GoTrue v2.158.1,
PostgREST v12.2.3, Kong 2.8.1, Python 3.11 (Debian Bookworm). GoTrue, PostgREST and
Kong match the repository's self-hosted stack versions. These are test fixtures,
not a recommendation that old platform versions meet production security needs.

For an enterprise/managed network with an additional trusted CA, an operator may
explicitly provide a public CA bundle via `--ca-file /path/to/ca-bundle.pem`.
TLS certificate verification is not disabled. Do not provide a private key.

## Isolation

- Fresh random resource names, JWT secret and DB password on each run.
- Only resource IDs created by this process are used for cleanup.
- Internal Docker network, no published ports, no production network membership.
- PostgreSQL data lives in container tmpfs; no persistent database volume.
- Dependencies build from public `requirements-web.txt` only. The runner mounts a
  temporary copy of tracked Python sources and public template/static assets,
  not `.env`, Git metadata, existing SQLite
  records, dashcam files, browser data or credentials from the checkout.
- Actual migration files apply only to the new disposable database. No migrations
  are run against a host port, Supabase deployment or operator-supplied URL.
- GoTrue creates its real users and sessions schema. Two synthetic email users
  auto-confirm locally; no SMTP credentials or external mail transport are set.
- No private write handler, auth function, HTTP authority or RLS check is mocked.
  The test app selects fixture SQLite storage and seeds old data directly so
  owner read/delete can be tested while new uploads remain denied.
- The fixture GoTrue uses the disposable DB administrator for migration/startup.
  This intentionally does not verify production auth DB-role least privilege.
- Service logs are bounded in disposable Docker storage (2 × 1 MiB per container);
  gateway HTTP access logs are disabled. Normal output contains named assertions.
  Startup failure diagnostics redact synthetic credentials, JWTs, UUIDs and email
  addresses. Raw logs are not uploaded as CI artifacts and are removed with their
  containers. There is no real user data in this lab.
- Normal completion, exceptions and Ctrl+C attempt cleanup. SIGKILL, daemon or
  host failure can leave resources; inspect the printed unique lab name before
  any manual removal. Never run generic Docker prune or remove existing volumes.

## Coverage and limits

Tests exercise real signup/JWTs, gateway routing, PostgREST signature/expiry,
own-user consent RPCs, unavailable grants, withdrawal, private no-store headers,
retired optional uploads, A/B snapshot and SQLite ownership, owner erasure with
cloud OFF, dashcam owner/range/deletion requests, real global logout,
revoked-session reuse against a retained record, and unaffected second user.

Existing SQL suites separately test expiry, category epochs, lock ordering,
permission/withdrawal races, privileges and repeated migrations. They complement
this harness rather than replace real HTTP testing.

Not covered: deployed infrastructure, external TLS/reverse proxies, real production
role grants, storage/backup encryption, backup restore/deletion reconciliation,
all full-app routing and PWA startup, browser offline upgrades, physical GPS,
Bluetooth, microphone, wake lock, long recordings or phone storage eviction.
Successful results are not a GDPR compliance certification or deployment approval.

There are no runtime code changes or production migrations in this harness.
Rollback is to stop using it; no production settings need reversing.
