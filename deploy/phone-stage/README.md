# Private phone-test edge (operator preparation, not a deployment)

This is a dedicated guest-only test origin. It does not change the live app or the
existing `voyagr-auth.duckdns.org` host, and does not expose the automated lab.
The proposed new hostname is `voyagr-phone-test.vibevoyager.org`; confirmed VPS2
IPv4 is `149.102.131.27`. Check the address again if the host changes.

No paid tunnel subscription is required. Use the existing Nginx/Certbot and a new
DNS record, certificate and password file. No candidate has been started, DNS
changed or Nginx configuration installed by adding these templates.

## Prerequisites and sequence

1. Install the missing `apache2-utils` password utility on VPS2. Check the existing
   Nginx worker user before assigning password-file group permissions. Do not paste
   passwords, hashes, certificate private keys, environment files or tokens into chat.
2. Confirm the new DNS hostname is unused. Add only its A record to VPS2's address,
   initially DNS-only. Leave the live site/auth records unchanged. Verify resolution.
3. Create `/var/lib/voyagr-phone-acme/.well-known/acme-challenge/`. Install the
   HTTP-only template as a *new* site, check the full configuration with `nginx -t`,
   then reload. No candidate data is served over plaintext HTTP.
4. Issue a new certificate with Certbot **certonly --webroot**, using the new
   webroot/hostname. Do not stop Nginx or use standalone mode on its occupied port.
   Do not reuse the auth hostname's certificate or private key. Confirm renewal
   challenge handling remains available.
5. Create a new password file interactively with bcrypt via `htpasswd -B -c`.
   Refuse to overwrite an existing file. Restrict file access to root/the actual
   Nginx worker group. This password is separate from all app/database accounts.
6. Install the HTTPS-only template as another new site after its referenced files
   exist. Run `nginx -t` before reloading. Confirm the original auth host and live
   app still respond without changing their configuration.
7. Start a separately prepared phone candidate at **127.0.0.1:18081 only**. The
   candidate launcher and routing inputs must be reviewed separately; these edge
   templates alone do not start an app. Do not keep the disposable lab running or
   expose its GoTrue/database/worker-revision endpoint for phone access.

## Access boundary and constraints

Basic authentication is inherited by the app, static assets, worker, map/style,
glyph and tile paths. Explicit rejected fixture/gateway/report paths return a
denial before proxying; the only public webroot is the ACME challenge on HTTP.
No password/user IP header is forwarded upstream. These controls do not replace
the application's server-side privacy/ownership enforcement.

Basic authentication and app Bearer tokens both use Authorization. Therefore this
manual origin is **guest-only**: use no production Supabase URL, credentials or
copied account data. Real account-isolation flows remain covered by the isolated
browser/HTTP harness. Do not claim manual account testing behind this password
gate. Existing browser storage on the production origin is separate and untouched.

The candidate needs real routing/geocoding/map services for meaningful GPS/ETA
testing. Configure only reviewed routing URLs and non-personal data sources;
never copy production `.env`, SQLite/Postgres databases, media or credentials.
Camera data, current Overpass access, fuel snapshots, traffic/weather and AI voice
are not provisioned by these templates. Mark missing capabilities NOT TESTED.
Do not present unavailable services or synthetic responses as live verification.

Edge request/error logging is disabled for this private test site to avoid path,
query and password retention. Candidate and upstream routing/tile/geocoder logging
still require review before real-location tests; disabling Nginx logs alone proves
nothing about upstream retention. Use synthetic inputs while reviewing those gates.

## Verify before phone use

- Trusted matching certificate, no certificate bypass and no mixed content.
- Unauthenticated HTTPS root/assets/worker/map routes deny access (401), including
  direct-origin requests with the test Host/SNI. All rejected fixture/API routes
  remain blocked. Never add a public bypass for PWA resources.
- Correct password reaches the exact candidate commit; wrong password does not.
- Candidate listener remains loopback-only. No Supabase or existing data mounts.
- Style responses refer to same-origin HTTPS paths; map resources work behind the
  password. Keep application asset-cache headers for offline integrity checks.
- Before a trip, sign into the private test origin while parked. HTTP-auth session
  persistence can differ between browser/installed-PWA contexts; test it on the
  actual phone. Do not bypass authentication to fix a failed resource request.
- Test controls while parked; a passenger can observe GPS movement, ETA/remaining
  distance and sign comparisons. Bluetooth, wake lock, app-lock interference,
  real recording and phone storage pressure require physical verification.

## Rollback

Disable only the new test sites, validate with `nginx -t`, and reload. Stop only
the separately named phone candidate. Remove only the new DNS record if desired.
Keep the existing auth/live configuration intact; do not stop shared services,
prune Docker resources, revoke shared certificates or delete user records. The
certificate/password lifecycle can be cleaned up separately after stopping tests.

## Automated edge verification

Run `python3 scripts/test-phone-stage-edge.py` on a Docker test host. It uses
throwaway TLS credentials and an isolated network with no host ports. All 21
checks passed locally: real Nginx syntax, TLS verification, authentication,
credential stripping, map proxy paths, blocked write/fixture paths and ACME.
This tests the edge with a synthetic upstream, not live maps or phone behaviour.
