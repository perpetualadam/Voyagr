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
