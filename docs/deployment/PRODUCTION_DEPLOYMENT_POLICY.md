# Intended production deployment: Contabo only

Contabo is Voyagr's **sole intended production provider**. This documents the user-confirmed target; it is not a claim that the running host was inspected or that deployment is authorized.

| Component | Intended production target |
| --- | --- |
| Provider | Contabo |
| Application VPS | `vmi2887070` |
| Application directory | `/opt/voyagr` |
| Application service | `voyagr` (systemd) |
| Reverse proxy | Nginx |
| Production domain | `vibevoyager.org` |

The separate routing/laboratory VPS is outside this application deployment target and must not be modified by this cleanup. Existing Contabo scripts, systemd configuration and Nginx configuration are unchanged.

## GitHub merge is not a deployment authorization

GitHub Actions CI runs on main pushes and pull requests. The workflow named **Deploy to Contabo** runs on main pushes/manual dispatch, but only checks out source, prints operator instructions and reads the last commit. It does not SSH, invoke deployment scripts or restart services. It does not wait for CI despite its historical comment. Build APK is manual only. None of these workflows calls a reusable deployment workflow or declares a production deployment job.

The existing [Contabo operator instructions](../../CONTABO_UPDATE_COMMANDS.md) describe a separately authorized manual deployment. Do not execute those commands merely because a PR is merged. This cleanup authorizes no deployment, restart, production access or change to routing/laboratory infrastructure.

## Obsolete Railway files removed

- `railway.toml`: provider-specific build/start configuration. Removed because Railway is no longer an intended production target; the configured Dockerfile/start command is not the Contabo systemd deployment path.
- `requirements-railway.txt`: explicitly deprecated two-line alias for `requirements-web.txt`, with no distinct dependencies. Current Dockerfile, CI and Contabo setup use `requirements-web.txt`; no tracked executable/build configuration references the alias. Remaining references in historical documents describe old arrangements.

The generic Dockerfile and Procfile are retained: neither establishes an active Railway GitHub connection, and deleting them could affect other build/local uses. Application environment/proxy compatibility and diagnostics are retained. Railway crossing hazards, avoidance settings and map layers refer to rail infrastructure, not the hosting provider, and are unchanged.

The 15 dedicated old Railway deployment guides and the Phase 6 cloud deployment guide now carry a superseded notice. Other dated completion reports remain historical evidence, not production instructions. The [reference inventory](RAILWAY_REFERENCE_INVENTORY.tsv) lists 184 tracked files matching Railway in content or filename at baseline `16d26dd1ef970ea95dba32deabfe85b55cfd3bf7`, with category, count and line numbers (1,084 content references, plus the filename-only railway.toml entry); it excludes secret values. The active deployment documentation is this policy and the Contabo operator guide.

## External Railway integration remains unresolved

Deleting repository files **does not disconnect Railway from GitHub or guarantee prevention of deployment**. Railway may still build a generic Dockerfile or Procfile using provider-side settings.

GitHub exposes the historical production environment `web (divine-peace / production)` and deployments from `railway-app[bot]`. The latest returned deployment was created 2025-11-29 and marked inactive 2025-12-03. That status describes a deployment, not a disabled GitHub push trigger. Repository webhook inspection returned HTTP 403; current Railway service-source/auto-deploy settings are unavailable. No settings, installed apps, webhooks or secrets were changed.

Before declaring a main push safe from external production deployment, obtain current authorized read-only evidence of Railway service repository/branch/auto-deploy settings and GitHub webhook/installed-app connections. Native GitHub App subscriptions may not appear in repository webhooks. Investigate other providers if that connection inventory identifies them. Historical Vercel/Heroku suggestions are not proof of active deployments. Any disconnection requires separate explicit authorization.

**PRODUCTION_NO_GO.** Browser/device acceptance and applicable legacy journey recovery gates remain separate. This repository cleanup does not clear the unresolved external deployment gate.
