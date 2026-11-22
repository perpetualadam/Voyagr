# Registered test-plan restoration — milestone 3 development

Scope: isolated public fixtures only. No VPS2 update, production app change or
real navigation authority. Existing saved journeys and browser storage are not
read, migrated, cleared or overwritten by this feature.

## Subsequent explicit-policy extension

Schema-1 references remain the standalone viewer contract. Explicit canonical
policies now use schema-2 API references carrying the full selected policy, which
is recompiled during restoration. See [SETTINGS_COMPILER.md](SETTINGS_COMPILER.md)
for refusal, binding and body-limit details. The viewer does not silently strip
advanced policy fields; advanced policy restoration remains API-only.

## Contract

A successful preview includes `plan_reference`: schema 1, registered case ID,
graph/source/policy versions, exact registered settings and request fingerprint.
The fingerprint includes the full operator-owned case, including ordered visits.
A reference carries neither geometry nor a cached compliance verdict or secret.
It is a selector, not a signed authorization token. A caller may select another
registered case, but cannot introduce arbitrary coordinates, rules or authority.

Authenticated `POST /api/prototype/restore` accepts exactly that reference.
Unknown fields, unsupported schemas (including boolean `true`) and unknown cases
return 400. Changed settings, versions or binding return 409 before route/cache
access. Authentication, same-origin enforcement and the existing 1 KiB body limit
apply. No new credentials or listener are introduced.

A matching reference uses the same bounded Java/independent-validation path as
Calculate. Warm-cache restoration revalidates raw evidence for every candidate;
expired/evicted evidence requires another Java calculation. A reference is never
replayed as a route verdict. Changed graph/runtime inputs, invalid evidence,
provider failure and no-route conditions still refuse without fallback. Every
response/candidate keeps navigation unavailable and production migration NO-GO.
Frozen source snapshots do not establish current hazard coverage.

## Browser behaviour

A collapsed “Keep or restore a test plan” panel exposes the reference as text.
Users can copy it themselves; no clipboard, file download, browser-storage write
or automatic persistence occurs. A pasted reference must match the currently
loaded registry/settings/versions before an HTTP restore request is sent.

Restore retains the current preview while checking. A failed request, malformed
candidate or superseded response cannot replace its geometry, instructions or
selected alternative. A successful, current response replaces the preview only
after checking its identities, reference and renderable candidate contract. The
Start control remains disabled. A case change invalidates an outstanding restore
through the shared request ticket. Calculate retains its existing clear-on-failure
preview behaviour; this experiment has no active journey to interrupt.

## Verification

```sh
GH11_PROTOTYPE_JAR=/path/to/pinned/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py \
  tests/test_gh11_integration_boundary.py tests/test_gh11_isolated_app.py \
  tests/test_gh11_container_package.py
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

Real-engine tests restore after cache eviction and compare validated candidates;
corrupt warm evidence and no-route references are refused. HTTP tests reject
changed identities/settings, unknown authority/geometry fields, invalid schema,
unknown case, oversized bodies, anonymous access and cross-origin requests.
Browser tests cover local refusal, restored preview, offline/401/422 errors,
malformed response, superseded response, retained preview and unchanged storage.
The CI container smoke additionally checks authenticated restore 200 and changed
reference 409 on the generated graph. Check the exact-head CI result before
claiming packaging acceptance. Local container acceptance remains unperformed for
this revision because of the previously observed workspace filesystem limit.

## Proposed physical acceptance — not performed or deployed

After a separately reviewed isolated-service update:

1. Calculate a registered case, copy its reference, and confirm Start is disabled.
2. Reload the isolated viewer without clearing storage; paste and restore the
   reference. Check the same validated preview and disabled Start.
3. Change a version or mandatory selection in the pasted text. Confirm refusal
   and retained preview; no restore HTTP request should be sent.
4. Interrupt the tunnel/network and restore. Confirm an error and retained
   preview; reconnect and retry explicitly.
5. Change the selected case during a pending restore. Its late response must not
   replace the preview. Confirm authentication failure also retains the preview.

These checks cover the isolated viewer only. Production saved-plan rehydration,
arbitrary user settings, hazard freshness, general multi-stop/heading semantics,
current GPS origin and actual driving/navigation remain pending. This is not
milestone-3 completion or permission to deploy/merge.
