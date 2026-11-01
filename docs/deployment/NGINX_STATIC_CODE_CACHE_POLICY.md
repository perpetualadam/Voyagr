# Persisted production application JS/CSS cache policy

Scope: repository persistence of the owner-verified Nginx change for `vibevoyager.org`, based on application commit `f36e8e947156e7ac322b88b9516b073533a2f95f`. This PR does not access or modify production, apply configuration, purge caches, change Cloudflare, restart/reload services, merge, or change application/navigation/user data.

## Authoritative template and drift

`deploy/nginx-vibevoyager.org.conf` is the canonical repository template for this production domain. It names the domain, terminates HTTPS, redirects HTTP/www and proxies Gunicorn and the map stack. Its install comments and `deploy/apply-nginx-security-headers.sh` reference `/etc/nginx/sites-available/vibevoyager.org`.

`deploy/nginx-voyagr.conf` explicitly targets older DuckDNS/perpetualadam hostnames and directs canonical-host deployments to the domain-specific template. The older `deploy/setup-contabo.sh` still copies that legacy template during bootstrap. It is not an instruction to overwrite an existing canonical production vhost. Neither legacy file nor setup script is changed by this narrow PR.

| Item | Repository baseline | Owner-reported live state | This PR |
| --- | --- | --- | --- |
| `/static/js/`, `/static/css/` | Fall through to seven-day generic static policy | Two specific `^~` prefixes return `no-cache, must-revalidate` | Adds those two effective policies |
| Generic `/static/` | Seven-day public immutable | Retained | Unchanged |
| HTML, worker, maps, API, TLS/security/proxy behavior | Existing canonical template | Reported unchanged by live fix | Unchanged outside the two new locations |
| Complete live file/Certbot/real-IP/custom settings | No current export available | Not supplied in this task | No byte-for-byte drift claim |

The live correction and origin verification are supplied by the owner, not reverified by this task. The live file's actual symlink target and all other custom drift require separately authorized read-only inspection. Do not treat the repository template as a complete export of the live Nginx configuration.

## Effective behavior

Two longer `location ^~` prefixes override the shorter `/static/` location and competing regex locations. Their `proxy_pass` preserves the corresponding Flask `/static/js/` or `/static/css/` path and query. HTTP/1.1, Host and X-Forwarded-Proto settings match the existing generic static proxy.

Both prefixes hide every upstream Cache-Control and Expires field, turn generated expiry off, and add exactly one `Cache-Control: no-cache, must-revalidate`, including error responses. Each includes the existing security snippet because Nginx `add_header` inheritance changes when a location declares its own headers. No security snippet, HTTPS/TLS directive or authenticated API location is edited.

`no-cache` allows storage but requires revalidation; it does not mean no-store. Existing old browser, worker or CDN cache entries are not retroactively removed by an origin-header change. This PR does not clear them or claim all clients immediately updated.

Other static paths deliberately keep the existing seven-day policy, including vendor JS outside `/static/js/` such as `/static/vendor/maplibre-gl.js`. This is the exact prefix scope of the validated production fix, not a global extension-based JS/CSS redesign. Broader content-addressed asset/service-worker work remains separate in draft PR #381; none of that implementation is included here.

## Automated validation

Run with a test Nginx binary and OpenSSL:

```sh
NGINX_BINARY=/path/to/test/nginx python scripts/test-nginx-cache-policy.py
```

The standard-library harness runs real `nginx -t` and `nginx -T` on the complete canonical vhost in a temporary prefix. Only fixture listeners (high loopback ports), Gunicorn/map upstreams (one loopback synthetic backend), TLS certificate/key/DH files and Certbot options are substituted. The actual security include is copied unchanged. No production IP is used as an upstream, and redirects are inspected without being followed.

The harness uses a trusted temporary self-signed certificate with matching SANs, not disabled TLS verification. It starts/stops only its disposable Nginx process and synthetic backend; it installs no package and never invokes systemctl. Every temporary/log/PID/body/proxy directory is under its temporary prefix. It additionally inserts a competing regex for JS/CSS prefixes to prove `^~` selection rather than merely checking source text.

Eleven checks cover nested JS/CSS paths and query changes; duplicate upstream Cache-Control/Expires removal; exactly one policy on 200 and 404; HSTS/nosniff; generic static seven-day policy; worker/HTML no-store; private authenticated API and cookie forwarding; unchanged map prefix/cache policy; and HTTP/www redirects. These are isolated integration results, not production verification or a Cloudflare test.

Local Nginx version tested: **1.26.3**, unpacked from the official Debian package outside the repository without system installation. `nginx -t`, `nginx -T` and all **11 response/routing tests passed**. Existing `listen ... http2` syntax is accepted with a deprecation warning and deliberately left unchanged. Synthetic Certbot options/certificates do not validate the actual live TLS files.

Hosted CI adds a dedicated Nginx job. It refreshes the ephemeral runner's package index, downloads/unpacks the OS Nginx package without installing it or starting a system service, prints the version and executes this harness. Existing application CI jobs remain in place.

## Four-hour Cloudflare TTL investigation — no settings changes

Repository deployment/CI configuration contains no `14400`, `4h`, four-hour cache rule, Browser Cache TTL/Edge Cache TTL configuration, or Cloudflare rule export. The two new origin policies also contain no four-hour freshness allowance. The observed four-hour TTL cannot be attributed to a repository origin rule on this evidence.

Possible explanations include a Cloudflare Browser Cache TTL override, a Cache Rule/legacy Page Rule, or observing edge-object age/retention rather than browser freshness. These are hypotheses, not verified configuration facts. `Age`, `Cache-Control`, `Expires` and `cf-cache-status` describe different things; an Age value alone is not a configured TTL. A custom edge rule can also override origin headers, so passing these origin tests is insufficient to prove the edge policy.

A separately authorized investigator should compare the **same ordinary URL** at the origin and edge, record Cache-Control/Expires/Age/CF-Cache-Status/ETag/Last-Modified and conditional-request behavior, then inspect matching cache rules and query-key settings. Omit cookies, authorization and user-specific API payloads. Do not infer existing-user behavior from a unique cache-busting URL. No Contabo/Cloudflare or production HTTP access was performed here; no purge, rule change or removal of Cloudflare is proposed as an automatic action.

## Deployment procedure — owner approval required, not executed

The production change is already reported working, so merging repository persistence may require **no live change or reload at all**. First compare the actual working vhost's two locations with this patch under separate access authorization. Preserve Certbot paths, real-IP rules, custom includes and unrelated changes; do not blindly copy an entire template or run the legacy bootstrap/security script as deployment automation.

For a future separately approved application:

1. Resolve the enabled canonical site's actual file target. Back up that **working file** with owner/mode preserved in a new root-owned directory with mode 0700. Record its checksum and the reviewed repository revision; never include TLS key contents or environment secrets in evidence.
2. Merge only the two locations if missing/different. Retain the generic `/static/`, exact HTML/worker, map, API, TLS and security configuration. Do not create duplicate copies of the same prefix.
3. Run the host's actual `nginx -t`. Stop on error. If there is no effective difference from the working production correction, do not reload merely to record Git persistence.
4. Only with separate configuration-application authorization, reload Nginx after syntax passes; do not restart the application or unrelated services. Check bounded Nginx diagnostics and public JS/CSS normal URLs at the origin and edge. Require one effective origin Cache-Control policy and no conflicting Expires for the protected prefixes; validate unchanged security/worker/HTML/map/API behavior without reading private users' histories.
5. Investigate edge differences as separate evidence. Do not automatically modify Cloudflare or clear browser data.

## Rollback

If a future config application fails `nginx -t`, do not reload. Restore the backed-up working vhost if necessary and revalidate. If a separately authorized reload causes a verified regression, restore the protected pre-edit file, test it, then perform a separately authorized reload. Keep the diagnostic evidence and verify public responses afterward. No database, browser storage, service worker or application source rollback is needed for this config-only change.

The correct rollback target is the **pre-edit working live file**, which the owner reports already contains the validated correction. Blindly reverting to the old repository `/static/` fallback would reintroduce seven-day immutable caching for application code and is not a safe default. No purge, browser reset, service restart or production operation is part of this PR.

## Independent-review readiness

Changed files are limited to the canonical Nginx template, this documentation, the isolated integration harness and the dedicated CI job. No application JavaScript/Python, navigation policy, map/API block, shared security snippet, legacy vhost or user-data logic changed. Review the exact prefix/proxy/header semantics, upstream duplicate suppression, security inheritance and fixture substitutions. Hosted results and exact reviewed commit/tree are recorded in the draft PR.

Local repository verification on this branch also passed: JavaScript test lint; **115 Jest suites / 2,572 tests**; the declared **75-file backend web selection, 1,658 passed, one Windows-only skip and 68 subtests passed**; and **11 SQL policy tests** against disposable local PostgreSQL. Hosted exact-head results are recorded in the draft PR. No application or browser behavior is inferred solely from these isolated Nginx tests.
