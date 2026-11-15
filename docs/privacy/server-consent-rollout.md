# Reviewed server-consent rollout and rollback

This is a future operator runbook, not an executed deployment. Do not connect to a
production database, apply SQL, delete records or restart services as part of the
Phase 4 development task. Obtain explicit rollout/migration authorisation first.

## Before authorising a production change

1. Review the exact application commit and
   `supabase-selfhost/volumes/db/init/03-privacy-consent.sql`, including privileges,
   restrictive RLS, the 30-day proposed maximum grant lifetime and epoch retention.
2. Confirm the target project/database. Existing `01-voyagr-schema.sql` snapshot
   table and Supabase auth helpers/session authority must be established. Verify
   actual GoTrue session creation/revocation/timeboxing and gateway JWT enforcement.
   Docker init files are not an upgrade mechanism for an existing volume.
3. Use a disposable staging restore with access denied to public clients. Confirm
   migration ownership and role memberships. The operator must be a trusted
   privileged role, not anon/authenticated/service_role; exposed client roles must
   not bypass RLS. Do not relax the preflight to make an unsafe role setup pass.
4. Inventory custom snapshot grants, policies, functions and external writers.
   Restore/replication jobs must not reinstate old permissive permissions. Inspect
   proxy/application logging for body/query/token exposure without printing actual
   location payloads or credentials into support logs.
5. Preserve existing records and test recovery without promising backups are erased.
   Authorise any personal-data retention/deletion changes separately. No grant is
   inferred from old route/history/media payloads, login or browser settings.

## Coordinated rollout, only when authorised

- Apply the reviewed SQL transaction to the confirmed target using trusted operator
  tooling. No application service-role key is a substitute for migration ownership.
- Verify the PostgREST schema reload and test anonymous, real user A/B, revoked/
  expired sessions, service-role and category/policy/epoch failures over actual HTTP.
  The temporary SQL suite is not proof that gateway configuration is correct.
- Check direct snapshot INSERT/UPDATE and upsert fail; A cannot read/delete B's
  data. Existing owners can list/download/delete their own retained records with
  all categories OFF. Client roles cannot grant themselves policy/ledger privileges.
- Keep every server category unavailable. Do not enable availability as part of
  this phase or use the synthetic test payload RPC in production.
- Stage the matching local-first client/server release and coherent PWA assets.
  Old clients must receive safe denials rather than silently continue uploading.
  Necessary anonymous routing/rerouting/lookups and local recording must still work
  when the privacy authority is unavailable.
- Verify that consent/private responses are no-store and not replayed by the
  service worker. Old browser cache copies are not erased automatically.

## Backups and recovery

A full database restore can resurrect old grants, epochs or permissive policies.
The current release's plaintext API writes remain denied, but that alone is not a
future encrypted-cloud restore guarantee. Keep restored instances quarantined;
reapply/review the deny boundary, keep categories unavailable, reconcile withdrawals
and deletion state from a trusted restoration plan, and require fresh grants under
a reviewed policy version before permitting future optional writes. Do not publish
an old consent snapshot and treat its enabled values as fresh authority. External
backup deletion/reconciliation remains unverified and requires a separate approved
retention/recovery process.

## Rollback

Prefer a forward fix. If the authority fails, leave optional uploads unavailable
and necessary navigation independent. Preserve consent rows/epochs, retained user
payloads and restrictive policies. Do not roll back to permissive snapshot RLS,
re-enable legacy SQLite/file writes, restore the localhost privacy bypass or copy a
browser grant into the server ledger. A client-only rollback can resume old
upload attempts, so maintain server denials. No rollback step should delete user
records or the policy ledger without separate explicit authorisation.
