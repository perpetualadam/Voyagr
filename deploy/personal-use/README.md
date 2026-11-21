# Personal access on VPS1

This first increment protects access to the existing app. It does not yet remove
account/subscription controls, change cloud services, delete records or change
the private phone candidate on VPS2. A separate deployment is required; merging
these files does not enable protection.

Prerequisites confirmed for the target host:

- Nginx sites `vibevoyager.org` and `voyagr` resolve into `sites-available`.
- Gunicorn listens on `127.0.0.1:5000`, not a public interface.
- Both certificates renew with the Nginx authenticator/installer.
- `/etc/nginx/voyagr-personal.htpasswd` was created interactively with bcrypt,
  user `owner`, root:www-data ownership and mode 640. Never commit this file.

## Apply

Run the standalone helper as root, first without `--apply`:

```sh
python3 deploy/personal-use/enable-private-access.py
python3 deploy/personal-use/enable-private-access.py --apply
```

The helper preserves HTTP blocks verbatim, gates every HTTPS server in both
files, and strips Authorization before each proxy hop so the access password
does not reach the app or map services. Existing redirects, proxy paths, cache
and security headers are preserved. Ambiguous/previous access rules, inline
proxy syntax or HTTP content-serving configuration require manual review.

Before mutation, it checks password permissions, worker readability and current
Nginx syntax. Originals and target paths are saved under the printed private
`/root/voyagr-personal-backup-*` directory. It tests the new configuration and
reloads Nginx. Validation/reload failures restore the originals and remove only
the newly created access snippet, then validate/reload the old configuration.
It never changes certificates, application configuration or user data.

## Verify

Anonymous requests to each public hostname must reach a 401 challenge (www may
redirect to the protected canonical host). Check root, `/api/config`,
`/service-worker.js`, a real static asset and map resources. Check both the local
origin using `curl --resolve` and the public URL; this distinguishes CDN-cached
public assets from protected origin responses. Do not claim every public path is
private until those checks pass. Wrong credentials must fail.

Use `curl --user owner` without a password in the command to prompt securely;
discard response bodies while verifying 200. Then test the phone's map, GPS,
navigation and a fresh PWA launch. Do not clear browser storage. Verify renewal
with `certbot renew --dry-run --cert-name ...` for each certificate; the fixture
proves HTTP paths are preserved, not that the real CA renewed a live certificate.

Basic access and app Bearer authentication share Authorization. This profile is
intended for account-free/guest use; account controls and public auth services
still need retirement in the next increment. The access password grants no app
administrator or account-ownership authority. Preserve existing account records
pending an explicit export/retention/deletion decision.

## Manual rollback

Use the exact printed backup directory. Copy its two site files back to the
paths listed in `targets.json`, remove only the new
`/etc/nginx/snippets/voyagr-personal-access.conf`, then run `nginx -t` and reload.
This reopens the previously public sites: use rollback only deliberately. Keep
the password file and backup; neither needs deletion to restore the old sites.

## Controlled validation

`tests/test_personal_access_config.py` checks transformation and refusal rules.
`python3 scripts/test-personal-access-edge.py` tests verified TLS, anonymous and
wrong-password denial, owner access, upstream password stripping and preserved
HTTP redirect/domain-proof paths using disposable Nginx and synthetic credentials.
It exposes no host ports and never reads production configuration/passwords.

## Account-free application mode

Set `VOYAGR_PERSONAL_MODE=1` in the application's service environment and restart
Voyagr after deploying the release containing this setting. It defaults off;
merging code alone does not enable it. Keep the Nginx password protection enabled:
this flag is not authentication.

Personal mode omits sign-in, sign-up and Premium controls and the account SDK.
It ignores cached account bootstrap settings, prevents app account/coupon/checkout
requests, disables analytics and search indexing, and retains the local guest
profile. Routing, map and search requests still use configured services. Existing
account records and tokens are not deleted, revoked or imported into guest data.
Personal mode hides community-report controls, refuses report submissions (including
voice actions), and excludes community reports from nearby alerts while retaining
mapped cameras. Existing report rows are preserved. Externally hosted auth services,
subscriptions and remaining server storage are separate retirement decisions; this
flag does not decommission them.

To roll back this application mode, remove its service environment setting and
restart the app. Keep Nginx protection and browser storage intact.

### Operator verification recorded 16 November 2026

The operator reported anonymous 401 responses for root, config, service worker,
JavaScript and map paths on canonical, www and DuckDNS hosts (15 checks), owner
access 200, and successful Certbot renewal dry-runs for both certificates. The
access-change backup is `/root/voyagr-personal-backup-1rz6q7zh`.

The operator enabled account-free mode on VPS1 and confirmed personal_mode true,
require_login false, no account provider and no checkout. Full phone acceptance
of navigation and retained local records remains open.
Local validation passed 2,405 backend tests (one skip), 3,730 JavaScript tests,
42 disposable HTTP checks, 75 existing full-candidate Chromium checks and 12
personal-mode Chromium checks. The latter verify old account configuration cannot
restore login/billing, no account SDK or analytics bootstrap occurs, and guest
records survive reinitialization and reload. All browser data is synthetic.
The GPS fixture now waits through the existing unavailable-source retry interval
to establish a fresh stopped anchor when Chromium initially supplies a cached fix;
production freshness checks are unchanged.

## Repair interrupted browser password prompts

An already cached app can keep making map-layer requests before the browser has
finished the private login. Each unauthenticated request previously returned a
Basic challenge, allowing concurrent prompts to interrupt password entry.
The operator's logs showed repeated camera, traffic-light and crossing 401s.

Run the standalone repair first as a dry-run, then apply:

```sh
python3 deploy/personal-use/repair-private-prompts.py
python3 deploy/personal-use/repair-private-prompts.py --apply
```

It requires the original access snippet, the existing protected TLS sites and
Nginx's auth_request module. It changes only the access snippet and adds
`/etc/nginx/conf.d/voyagr-private-auth.conf`. A Unix-socket-only Nginx verifier
checks the same password file; there is no additional public port or app account.
Document requests still receive 401 with a Basic challenge. Fetch modes `cors`,
`no-cors` and `same-origin` receive 403 without a challenge when credentials are
missing or wrong. This request-mode distinction controls prompting only: every
request still requires valid credentials. Requests without Fetch Metadata retain
the original challenge behavior. Site proxies still strip credentials before
contacting application/map upstreams. Authenticated requests continue normally.

The repair creates `/root/voyagr-prompt-backup-*`, validates Nginx and reloads it.
Validation or reload failure restores the snippet and removes its verifier file.
It refuses unexpected access/error overrides instead of guessing. It does not
change the password, certificates, HTTP renewal paths or browser data.

Verify anonymous root 401, anonymous API with `Sec-Fetch-Mode: cors` 403 and no
`WWW-Authenticate`, and owner-authenticated root/API 200. Close existing Voyagr
tabs, open the canonical HTTPS site and finish the owner login once. Check the
map layers and GPS on the phone; do not clear device storage. The repair prevents
background prompts; it does not turn an unauthenticated request into successful
map data, or prove the physical phone has retained credentials.

Manual rollback: restore `voyagr-personal-access.conf` from the printed repair
backup, remove only `/etc/nginx/conf.d/voyagr-private-auth.conf`, then `nginx -t`
and reload. The original private password gate remains in place.

The operator applied the prompt repair with backup
`/root/voyagr-prompt-backup-v96kayw9`. A fresh privacy-page owner login restored
the map on the phone after the cached app had opened without network access.

## Unlocking a cached personal app

The personal shell now checks the network-only `/api/config` on opening,
returning to the app, coming online and every 30 seconds while visible. Confirmed
401/403 responses show **Unlock private access** in place of the map loading
message. The link opens a fresh same-origin privacy-page URL, using the browser's
website password prompt, then lets the owner return to the app. It does not
collect credentials, redirect automatically, clear storage or change map/provider
logic. Requests are deduplicated and abort after eight seconds. Offline and server
errors do not create an expired-login notice; a successful check clears it.

This requires deployment of the updated app shell; an older cached release does
not acquire new UI until a coherent update completes. Keep the fresh privacy-page
recovery link available for existing installations. The prompt repair remains a
separate Nginx configuration change.

`node scripts/privacy-http-lab/private-access-browser.cjs` restarts a real Chromium
profile with a cached fixture worker and production unlock markup/CSS/JavaScript,
verifies the locked state and fresh Basic-login navigation, checks three handset
widths at normal and 200% text, and retains a synthetic device-storage marker.
The fixture worker models cached-shell fallback; this does not replace the full
candidate HTTP/browser lab or physical-phone acceptance.


### Recovery presentation during a journey

The recovery card is deferred while navigation is starting or active, and while
the completed-journey summary is open. A confirmed denial is remembered, but it
does not cover Stop or Done. After Stop without a summary, or after dismissing the
summary with Done, the existing unlock action becomes visible if access remains
denied. Successful rechecks clear the pending action. This only changes shell
presentation: Nginx authentication still protects every request. Expired access
can still prevent new maps, provider data or rerouting until the owner unlocks it.
No automatic login navigation, credential change, storage reset or page reload
is performed. These changes require deployment and a coherent shell update.

Synthetic acceptance covers delayed 401/403 during navigation, the real lifecycle
state event, Stop/summary/Done ordering, cached-worker login recovery and retained
local storage. Physical-phone acceptance remains pending: as a passenger, verify
Stop remains usable after an access denial, the summary is usable before Done,
and the unlock action then recovers the map without losing a saved local item.
Do not change the password or clear browser storage to force this while driving.

### Passive access status in Route Info

In personal mode, Info shows the last network-only private-access check separately
from GPS, road matching and provider availability. Confirmed 401/403 responses show
that owner login is required. During active navigation the text explains why the
unlock card is deferred; it does not cover controls or move focus. An open summary
also defers the card. While stationary, an explicit Info link opens the existing
protected privacy page in a new tab, preserving the original tab's in-memory
journey. Return to that tab after owner login; its focus/visibility check rechecks
access. No credentials are stored by this feature and no device data is reset.
Offline, timeout and server errors retain the last confirmed access state and
say the latest check could not complete; they do not establish login failure.

User-supplied logs on 21 November showed background 403 responses followed by
configuration and speed/road-context 200 responses after fresh owner login; the
user confirmed the speed-limit display returned. Those logs do not establish
whether an earlier valid login was lost or a cached shell opened without current
credentials. No fifteen-minute login timeout was found in the repository Nginx
repair. The original map disappearance remains unexplained by this evidence.

This UI requires application deployment and a coherent shell update, independently
of the previously applied Nginx repair. Production and physical-phone acceptance
of this additional UI remain unverified. Without clearing storage, check a saved
synthetic local item before and after explicit unlock, confirm map loading and
fresh GPS/provider requests, and check Stop/Done remain usable during deferred
recovery. Perform driving checks as a passenger. A successful configuration check
alone does not prove map tiles, GPS fixes or provider data are current.

### Search, answer-engine and AI discovery withdrawal

The app now always opts out of indexing, including when personal mode is off or
`VOYAGR_BLOCK_SEARCH_INDEXING=false` is left in an old environment. HTML has
noindex/nofollow/noarchive/nosnippet/noimageindex metadata and app responses carry
the matching `X-Robots-Tag`. Search canonicals, hreflang, social cards, JSON-LD,
answer-engine FAQ promotion and LLM-context links are no longer published.
`/robots.txt` returns a wildcard `Disallow: /` without sitemap/context references.
`/sitemap.xml` remains valid but empty; `/llms.txt` and `/llms-full.txt` return
410 Gone with no product/context material. These responses are not stored by
HTTP caches. The app manifest, icons, safety notices and private-login recovery
page remain functional. No device data is cleared and authentication is unchanged.

Application deployment and a coherent cached-shell update are required. The
repository security-header snippet also proposes the same always-on response
header for Nginx-served assets and errors. Updating that installed snippet is a
separate configuration operation requiring review/approval, backup, `nginx -t`
and reload. Include it in locations with their own `add_header`, because those
do not inherit server-level headers. Do not replace live site configurations
with generic examples or change the working password-prompt repair.

Before deployment, preserve existing authentication and confirm the app remains
bound to loopback. After an approved rollout, inspect headers without printing
credentials or location queries: owner root/privacy/manifest should still work,
anonymous app/API/map requests should remain denied, application responses should
carry the opt-out header, and owner requests to the former LLM documents should
return 410. Check root, www and the DuckDNS alias; the edge header check is separate
from the Flask check. Old cached documents may remain until the normal asset
update completes; do not clear browser storage to force this.

Crawler directives are voluntary and are not access control. Password protection
prevents anonymous crawling of protected content; compliant crawlers can obey the
wildcard policy if they can retrieve it, but there is no authentication exemption
for robots or bots in this change. Do not open the app so a crawler can read a
noindex tag. Existing search listings can persist, including URL-only listings
for robots-blocked pages. Google Search Console and Bing Webmaster Tools removal
requests may be needed for already indexed URLs; these require verified property
access and were not submitted by this change. Public repository links, third-party
copies, DNS/certificate records and previously collected AI data cannot be erased
by changing this application. No claim of completed internet removal or production
verification is made.
