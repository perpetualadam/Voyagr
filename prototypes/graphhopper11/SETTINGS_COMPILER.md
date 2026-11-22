# Settings/capability compiler — isolated API

This compiler preserves the supplied avoidance contract. It refuses a route
calculation when a mandatory rule cannot be supported or verified; it does not
turn that rule off. It does not establish that no compliant route exists.

Scope: registered public fixture previews only. No production changes, VPS2
access, deployment, strict bootstrap activation or navigation authority.
Milestone 3 remains in progress; production migration remains NO-GO.

## Input contract

`policy_compiler.py` accepts an explicit `profile` and `requirements` array.
Each row has category, boolean enabled, mandatory/preference mode and optional
route scope. Supported vocabulary matches all 13 real application categories:
speed/red-light/other cameras, traffic lights, railway crossings, other hazards,
avoid points, tolls, CAZ, congestion charging, motorways, ferries and unpaved roads.

Normalization preserves every row's meaning, including disabled rows. Rows are
sorted canonically for stable fingerprints. It rejects unknown/duplicate categories,
non-boolean flags, unsupported modes/scopes and unknown fields instead of dropping
or coercing them. Ordering the same rules differently does not change policy
identity. Changing a category, enabled value, mode or profile does.

This is the canonical avoidance-rule API, not yet an adapter for every UI control.
Legacy flags/master switches, electric/vehicle exemptions, scenic/quiet and
optimization/detour options still need an explicit real-app request adapter. Do
not silently discard those fields: they are rejected if supplied to this schema.

## Capability decisions

| Requested rule | Current compilation result |
| --- | --- |
| Disabled rule | DISABLED; retained unchanged, not a warning or a prohibition |
| Motorways in a registered case with literal `no_motorways: true` | COMPILED: that existing case uses the custom model plus independent edge checks |
| Motorways without that registered mechanism; toll/ferry/unpaved/CAZ/congestion | UNSUPPORTED in that case; imported attributes or GH11 features alone are not proof of an enabled implementation |
| Cameras, signals, crossings, other hazards and avoid points | UNVERIFIED for general association, coverage or freshness; selected directional fixture proof is not promoted to complete category coverage |
| Non-car profile | Calculation refused; never silently substitute the registered car profile |

COMPILED means eligible for the existing registered calculation, not SATISFIED,
legal, fresh, safe or navigable. Actual Java/transport validation may still refuse.
Legal restrictions remain required and explicitly UNVERIFIED at this boundary;
users cannot disable them. All reports retain navigation and automatic-selection
permission false. The adapted planning assessment keeps selected requirements
with UNVERIFIED status for enabled rows, rather than manufacturing compliance.

An enabled mandatory UNSUPPORTED/UNVERIFIED row prevents routing before Java or
cache access. An unresolved preference remains enabled with preference mode and
an explicit warning/reason; only a preview may proceed. No engine fallback is
introduced. Reports explicitly set `route_absence_proven: false`.

## HTTP, bindings and restoration

Authenticated same-origin `POST /api/prototype/policy` takes case ID, current
versions and `policy_request`, returning a preflight report and bound request
identity. It verifies the manifest but never executes Java or touches route cache.
A well-formed non-compilable policy returns 422 with the preserved report; invalid
contracts return 400 and stale versions 409. Rule explanations are returned as
plain text alongside stable reason codes.

`/api/prototype/route` optionally accepts the same `policy_request`. The resulting
binding includes the entire normalized policy as well as the existing case,
ordered visits and graph/source/compiler policy identities. Distinct selections
cannot reuse a weaker policy's cache entry. Every hit is revalidated, including
recompilation; unsupported mandatory rules cannot replay a cached preference.
The compiler source hash is part of the operator manifest and policy version.
Missing/changed compiler identity refuses before evidence reuse.

Explicit-policy responses return schema-2 plan references carrying the full
normalized `policy_request`. `/api/prototype/restore` checks that reference and
recompiles before routing. Changed modes/versions/settings/bindings refuse; even a
new correctly formed reference cannot make unsupported mandatory rules pass.
References remain selectors, not signed navigation capabilities. A caller may
explicitly request a different policy, but that receives a different binding and
no authority. Existing schema-1 references/default fixture requests remain valid
only for the registered fixture contract; they never represent advanced policies.

The old fixed `selected_settings` and registered association exclusions are retained
alongside the explicit policy. An empty canonical list does not remove those
operator-owned fixture constraints or claim hazard-free coverage.

Legacy route/reference envelopes retain their 1 KiB limit. Explicit policies and
the preflight endpoint have a bounded 4 KiB body allowance so all 13 categories
can be supplied without truncation. Authentication and cross-origin checks run
before these body reads. Unknown fields and authority/coverage/edge-key injection
remain refused. This changes only the isolated factory's input limits.

Advanced policy input and schema-2 reference restoration are currently API-level.
The standalone viewer still selects default registered cases and schema-1 references;
it refuses advanced pasted references rather than silently dropping rules. The
real UI, owner-scoped saved collections and production RouteCache are not wired
into this compiler. No browser storage or existing journeys are changed.

## Synthetic example (no coordinates)

```json
{
  "profile": "car",
  "requirements": [
    {"category": "railway_crossings", "enabled": true, "mode": "mandatory"},
    {"category": "tolls", "enabled": true, "mode": "preference"}
  ]
}
```

Both rows survive normalization. Crossings are currently UNVERIFIED and mandatory,
so calculation is refused. Tolls remain an unresolved preference with a warning;
that warning does not weaken the crossing rule. This result means insufficient
capability/evidence, not proof that a crossing-free journey is impossible.

## Validation and remaining gates

Offline unit tests cover all categories/modes, disabled rows, mixed rules, exact
operator capability, profile refusal, input immutability, invalid/duplicate fields,
fingerprint normalization and parity with the real app's category vocabulary.
Real-engine/API tests check pre-Java/cache refusal, the registered motorway model,
retained preferences, full-length bodies, private origin/authentication, compiler
identity, cache separation and schema-2 restoration/downgrade refusal. The CI
container smoke also checks mandatory refusal, preference warnings and a policy
reference round trip on its generated graph.

```sh
GH11_PROTOTYPE_JAR=/path/to/pinned/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py \
  tests/test_gh11_integration_boundary.py tests/test_gh11_isolated_app.py \
  tests/test_gh11_container_package.py tests/test_gh11_policy_compiler.py
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

Local validation passed 154 engine/boundary/compiler/package tests, 200 JavaScript
suites / 3,890 tests and lint. The existing backend workflow selection passed
2,548 tests, one skip and 94 subtests. These do not constitute phone acceptance.

A fresh reviewed image/manifest and explicit approval remain necessary before an
isolated VPS2 update. Local container acceptance is not claimed for this revision;
check the exact-head CI container/Java 17 results separately. Physical-phone
acceptance, full UI request normalization, general hazard/turn/endpoint evidence,
private-cache integration and live navigation remain pending.
