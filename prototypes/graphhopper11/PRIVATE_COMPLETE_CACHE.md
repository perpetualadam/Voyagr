# Private complete-request cache — isolated registered cases

The complete-request bridge now reuses the actual `private_route_cache.py`
implementation through an isolated module and instance. It does not import the
production routing package, share the UK singleton/signing secret or write a
persistent cache. The isolated container copies only that implementation file.
Its source and the new cache adapter enter manifest policy identity; fresh
manifests/runtime packages are required. Nothing has been deployed.

## Ownership and transport

Only HTTPS complete calculation/restore handlers establish a private request
scope. Authentication and Origin guards still run first. The distinct
`__Host-voyagr-gh11-scope` capability uses Secure, HttpOnly, SameSite=Strict and
Path=/ without Domain. It does not overwrite the UK's cookie. Capability MACs and
cache keys use a separate per-app secret; keys bind the complete normalized/original
request, ordered visits/current origin, cost inputs, selected case, versions and
cache epoch. Client account IDs are not accepted as ownership claims. No key,
capability or shared hit/miss counter is exposed in routing JSON; only independently
revalidated route results are returned.

Missing, invalid or expired capabilities create a fresh cache scope. They do not
refuse routing, require an account or prompt for website credentials. The reused
15-minute cache-capability lifetime is not a Basic-authentication timeout. A fresh
capability is issued only after successful route validation and a cache write;
failed authentication, Origin checks, malformed requests, engine failures and
preflight alone cannot issue one. Existing cookies and cache TTLs do not slide on
hits. Worker/epoch changes simply cause cache misses.

Plain HTTP, including the existing SSH-tunnel preview, bypasses private caching
and never receives an insecure capability. A spoofed X-Forwarded-Proto header does
not enable it. No trusted-proxy middleware/configuration is added: future HTTPS
proxy integration requires separate review and approval, not header guessing.

## Evidence, bypass and retention

Only raw Java evidence is cached, after independent validation. Every hit first
checks current source/version/policy requirements, then revalidates every candidate
and leg and rebuilds the preview/assessment. Cached compliance flags are never
trusted. Unsupported mandatory policies and changed versions refuse before cache
lookup. Malformed/corrupt entries refuse without engine fallback in that request;
the isolated cache is cleared and its epoch rotated. No stale route is returned.

Reroutes, force_refresh and reference restoration always bypass both caches and
calculate/validate afresh. Without an HTTPS private scope, complete requests retain
their prior fresh behavior. The shared public-fixture dictionary is never used for
complete requests. The response's cache_policy describes the chosen path, not a
cache-hit verdict or navigation authority. All navigation/app-integration flags
remain false, with general hazard/legal/GPS evidence UNVERIFIED.

The separate cache is bounded to eight entries and 2 MiB, a non-sliding 30-second
serving TTL and a sweep interval of at most five seconds. These are normal-running
retention limits, not secure RAM/swap erasure guarantees. No database, account
service, location history, owner collection or browser localStorage is used for
ownership. References remain selectors; owning one is not a cache capability.

## Verification

Pure tests exercise separate browser scopes, Secure cookie attributes, no sliding
lifetime, entry expiry/epoch changes, invalid/expired capabilities, per-instance
secrets, HTTP/header-spoof bypass and capacity bounds. Real-GH11 TLS-client tests
check per-owner hit/miss behavior, changed-cost isolation, all bypass paths,
independent revalidation, corrupt-evidence refusal and no cookie on failed requests.

A fourth opt-in Chromium scenario runs against a temporary self-signed localhost
HTTPS service with fresh contexts. Certificate errors are ignored only in those
loopback test contexts. It verifies the actual browser cookie attributes and
HttpOnly behavior, independent contexts, changed requests, force/reroute/restore
bypass, invalid-capability recovery and a retained synthetic storage marker. The
server wrapper requires seven Java executions and nine independent validations:
cache hits reduce executions but never skip validation. The prior three HTTP
scenarios retain their original execution/validation counts and bypass behavior.

The ordinary test suite skips browser tests unless explicitly enabled. CI's existing
opt-in real_chromium step now runs all four. These do not establish physical-phone,
Nginx/PWA authentication, arbitrary-route, real hazard coverage or production-private-
cache acceptance. The UK app/cache configuration and VPS2 remain unchanged.

Next: owner-scoped saved collections and current accepted GPS/journey ownership,
plus the remaining general routing/capability gates. Milestone 3 is still in
progress and production migration remains NO-GO.
