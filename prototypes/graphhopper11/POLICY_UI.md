# Isolated avoidance controls → compiler → preview

This connects canonical rule choices in the standalone test viewer to the policy
compiler. It does not change the running UK settings page, access VPS2, activate
strict mode in the UK app, copy its stored preferences or authorize navigation.
The real UK request/parser/private-cache/saved-store connection remains pending.
Milestone 3 remains in progress; production migration remains NO-GO.

## Controls and requests

An optional Avoidance settings panel shows the server's 13 category choices as
checkboxes and Must avoid / Prefer to avoid selectors. Custom rules are off until
the user explicitly enables them. Enabling the panel does not enable avoidance
for every category: each checkbox is a separate selection. Disabled rows and their
modes are retained in the canonical request rather than silently removed.

The viewer calls the real shared `VoyagrAvoidanceIntegrity.augment` using a small
in-memory storage facade for these choices. It forwards the explicit canonical
requirements without changing mode or enabled state. It does not import the UK
page or read its different origin's preferences. Shared request ownership still
uses a read-only snapshot of the test origin's preference keys. No preferences,
references or journeys are automatically written to localStorage/IndexedDB or the
clipboard. These temporary choices are lost on reload unless the user keeps a
returned reference themselves.

A custom-rule calculation first posts the exact preflight contract to
`/api/prototype/policy`. Route-only fields such as `selected_settings` are not
sent to preflight. A refusal displays the compiler's explanation as text and
preserves the previous preview and controls; no route request follows. An allowed
preview preflight must echo the exact selected rules, retain every row and mode,
compile each enabled mandatory rule, and explicitly list unresolved preferences.
Unsupported/unverified mandatory rows cannot be made acceptable by a client flag.

Only then does the viewer request the registered route. It checks the bound
identity, full compiler report, reference and every candidate's selected-rule
assessment against preflight before replacing the preview. Unresolved preferences
remain selected and are shown with a warning. Compilation does not become proof
of complete hazard coverage or legal safety; the shared strict preview context
and server/candidate flags continue to refuse live navigation.

## Asynchronous ownership and retention

Selection/control changes invalidate the shared request ticket and local operation
owner. Both preflight and route responses also compare the captured UI snapshot,
so even a programmatic value change without a DOM event cannot commit an older
response. A single cancellation/deadline budget spans the complete operation;
a late response cannot route or commit after cancellation, even if the transport
ignores the abort signal. An older operation cannot re-enable controls owned by a
newer operation. No mode change ends or replaces real active navigation: this
viewer has no active journey or guidance engine.

Advanced calculations retain the previous preview until a fully checked replacement
exists. The status identifies changed rules and an unchanged earlier preview.
Legacy Calculate keeps its prior clear-on-failure behaviour. All restoration
failures retain the previous preview. A missing/malformed/inconsistent preflight
report, routed policy report, context or candidate assessment is refused.

## Reference restoration

The standalone viewer now supports both default schema-1 references and explicit
schema-2 policy references. The restore button explicitly restores the plan and
its rules. A schema-2 reference is normalized and checked against current
case/version metadata, preflighted again, and its binding must match before a
restore request is sent. Rules are applied to the controls only after route and
candidate validation succeeds. Failed restoration cannot overwrite current choices.

A restored partial API policy retains precisely its recorded rule set during the
next calculation; unrecorded disabled controls are not silently added. Editing
one of those controls makes that choice explicit in the next request. A legacy
schema-1 reference cannot silently remove currently active custom rules: the user
must turn custom rules off explicitly before restoring a reference without a rule
record. Existing real saved collections are not read, migrated, cleared or replaced.

References up to the existing explicit-policy 4 KiB bound are accepted. Unknown
fields, authority flags, unsupported category/profile/schema, changed versions or
bindings are rejected. A reference remains a selector, never saved proof of
compliance. Source changes require recalculation/review rather than reuse of an
old claim.

## Source/version identity

`/api/prototype/cases` adds the known category vocabulary. Invalid/duplicate or
oversized category metadata cannot initialize custom controls. Without category
metadata the legacy registered viewer can still be used, with custom rules disabled.

The operator manifest now binds the viewer JavaScript and HTML hashes as well as
the existing shared browser assets, compiler, validator, runner, graph and source.
Tampered or missing viewer identity refuses; it cannot silently acquire current
policy identity. A separately reviewed new image and freshly prepared manifest
are required before testing this on VPS2. The accepted milestone-2 service is
unchanged by this branch work.

## Automated and proposed physical acceptance

DOM regressions use the actual shared augmentation, planning and strict gate
modules with mocked HTTP responses. They cover preference warnings, mandatory
refusal before routing, compiled mandatory preview with Start disabled, malformed
reports, dropped/downgraded requirements, UI/programmatic changes during preflight
and routing, ignored cancellation/deadline, rule-preserving restoration, partial
references and legacy-reference downgrade prevention. Failure assertions check
that previous instructions/geometry and user choices are retained. Reports render
as text, not provider HTML. Storage remains unchanged.

Real-engine/API tests independently cover the compiler/transport contract. Two new
metadata/manifest tests check the 13-category vocabulary and both viewer hashes.
Local validation passed 157 engine/compiler/boundary/package tests, 200 JavaScript
suites / 3,909 tests and lint, plus the backend workflow selection of 2,548 tests,
one skip and 94 subtests. The focused viewer suite passed 43 tests. These do not
establish an actual HTTP browser session or physical-phone behaviour; exact-head
CI Java 17 and container checks are separate evidence.

After a separately reviewed and explicitly approved isolated-service update:

1. Calculate a registered preview, then select an unsupported/unverified Must avoid
   rule. Confirm its explanation, retained preview and no following route request.
2. Change that rule to Prefer to avoid. Confirm the preserved preference and warning;
   Start must remain disabled.
3. Change rules or the selected case while a request is pending. The old result must
   not replace the preview or restore old choices.
4. Copy a schema-2 reference, change current choices, and restore it. Successful
   restoration may load its recorded choices; a refusal must retain current choices.
5. Confirm a legacy reference cannot drop active custom rules and a stale reference
   cannot be restored. Repeat offline/401/timeout checks without clearing storage.

No such phone checks or new deployment have been performed. The initial canonical
controls did not accept legacy settings. The full-settings extension below adds
synthetic legacy normalization, not the live UK UI, arbitrary journeys, actual
optimization/scenic routing, owner-scoped saved journeys or production RouteCache.
General hazard, legal, turn/endpoint and freshness evidence remain incomplete.

## Full settings bridge (branch only; not deployed)

The separate full-settings mode accepts bounded synthetic settings JSON without
reading or writing device preferences. Its allowlist refuses unknown fields,
credentials, coordinates, nonempty avoid points and malformed values before HTTP.
It disables individual-rule editing while active, retaining those choices if the
user explicitly returns to that mode. No private journey input is added.

`/api/prototype/policy` accepts exactly one of `policy_request` or `app_settings`
with the registered case and three version identities. Raw settings are adapted
server-side and returned as a rich selected policy. This is preflight only: no
Java, cache lookup or route execution. Authentication, Origin and 4 KiB limits
remain unchanged. Route/restore still require the canonical rich policy.

The browser independently derives the expected profile and all legacy/default/
explicit canonical rules. It rejects inconsistent selected rules, dropped settings,
missing or altered supplemental warnings, and any app/navigation authority claim.
Unimplemented scenic/quiet/optimization/detour settings render as text with an
UNVERIFIED explanation. All supplied values enter the existing policy-bound route
request, cache identity and schema-2 reference; no browser storage is written.

Successful rich restoration loads the full settings after preflight and candidate
validation. The next calculation retains them. Refusal leaves the previous preview
and current choices intact. Legacy references cannot silently remove active full
settings. Input events and an independent semantic snapshot guard reject stale
responses, including programmatic edits without input events. Start stays disabled.

Focused DOM tests use real shared planning modules with mocked HTTP. Six shared
fixtures cover defaults, camera-off, electric/CAZ exemptions, explicit overrides and
road/optimization preferences; Python tests assert these fixtures equal the current
compiler outputs and JavaScript tests verify browser agreement. This avoids a
nested runtime subprocess dependency in the DOM suite. Real-engine Flask tests
exercise raw-settings preflight and guards; container smoke checks the same alias
and rich route/restore round trip. None establishes a physical-phone acceptance or
an actual HTTP browser session.

After a separately approved update, test synthetic full settings, unsupported Must
avoid, unresolved Prefer warnings, rich restore/next calculation, edits during both
requests, offline/401/timeouts and retained local data. Do not clear browser storage.
The real UK UI, arbitrary journeys, saved-store integration and deployment remain
pending. Milestone 3 remains in progress.
