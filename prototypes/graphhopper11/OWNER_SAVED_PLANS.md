# Owner-scoped saved preview plans — separate device database

The standalone viewer can now explicitly save a successfully validated schema-3
request reference and load/restore references for the active local preview owner.
It reuses the actual `VoyagrLocalStore` implementation with the distinct database
`voyagr-gh11-preview-plans-v1`. It does not load the data coordinator, invoke
migration/import, read production collections or write browser localStorage.
Existing device journeys are not discovered, rewritten or deleted.

Only an explicit Save action writes a plan. Load explicitly lists this owner's
entries; nothing is automatically saved or restored on startup. Records contain
only a schema, request-binding ID, saved timestamp and complete request reference.
They do not contain route geometry, saved compliance verdicts, cookies, cache
capabilities or navigation grants. References contain the original registered
request/coordinates and costs; use synthetic/public test cases only. The store
refuses authority-bearing/unknown fields and unsupported nested data. Twenty
entries are permitted per local scope; adding another refuses rather than trimming
existing data. Unrecognized stored entries remain inspectable as unsupported
metadata, and a save refuses to overwrite such collections.

The current owner defaults to guest. A trusted local runtime can switch the
session's local storage scope; no arbitrary-owner selector or server account
parameter is exposed in the UI. These IDs partition local records, not authenticate
accounts or grant access to the server cache. Authenticated-account wiring remains
pending. The server's separate HTTPS browser capability remains its cache scope;
no caller-supplied owner ID is trusted there. This prototype still routes only
operator-registered public cases, not private owner journeys.

Scope/epoch captures guard reads, writes and asynchronous UI completion. A write
is bound to its captured owner, never redirected to the next owner. A transaction
already committed in its original scope remains there; switching does not delete
or reassign records. Owner changes invalidate pending work, disable saving stale
results, clear the old preview/request/cost display and list, and reset request
controls. A delayed network result or saved-selector read cannot repopulate the
next owner's page, even after switching back to the same name with a newer epoch.

Restore reads a selector from the active scope, checks it against the current
registered contract and invokes the existing server preflight/fresh restore path.
It never treats stored geometry/verdicts as evidence. Changed graph/policy/request
bindings refuse without changing current choices/preview. Failed reads, denied
storage, quota/transaction failures or malformed data retain existing records and
never fall back to localStorage. Storage availability cannot block ordinary preview
routing. Complete-request restores continue to bypass server caches and keep Start
disabled; local save does not enable guidance or establish a fresh GPS fix.

## Evidence and limits

Fake-IndexedDB tests use the real store implementation to verify explicit saves,
separate namespaces, unchanged synthetic legacy records, owner/epoch isolation,
capacity, unsupported-record retention and storage failure. Viewer DOM tests cover
owner changes during an ignored-abort response, explicit validated-save gating
and a delayed selector read. These are separate from real browser evidence.

The fifth opt-in Chromium scenario uses real IndexedDB and real loopback HTTP/GH11.
It saves a guest reference, reloads, loads it and restores with fresh validation;
checks that only reference fields were stored; saves an independent local owner;
and switches owners during an actual server restore. The server wrapper requires
four Java executions and four validations, and the late result must not appear.
A synthetic marker and synthetic legacy record in the ordinary test database remain
unchanged. Observation endpoints exist only on the temporary test app; the normal
factory rejects those paths. The browser context is fresh and no actual user
profile, existing device data or production account is accessed.

The actual store and preview module are authenticated, source-hashed assets in the
isolated package. A fresh manifest is required for a reviewed update. No migration
of the existing phone's data, deployment or VPS action has been performed.

Still pending: integration with the real UK owner/session coordinator, actual
saved-route formats and accepted GPS/current-journey ownership, plus general
hazard/legal/stop/reroute evidence and physical-phone acceptance. Milestone 3 remains
in progress; production migration remains NO-GO.
