# Real-app settings preflight

The adapter is now accepted by the isolated registered-case service; it is not an enabled real-app connection or a deployed revision.
`app_settings_adapter.adapt_settings()` accepts only settings, retains every
supplied field and derives all 13 avoidance rows using the same dependency-free
normalizer that `voyagr/services/routing/integrity.py` re-exports. The extraction
preserves existing production normalization behavior; it changes no configuration.

`compile_app_settings()` applies the registered-case capability compiler. Unsupported
mandatory rules still refuse preview. Camera toggles cover the three camera
categories without disabling ordinary traffic signals or railway crossings.
Electric/CAZ exemptions and explicit per-category overrides retain legacy semantics.
Non-car profiles remain non-car and are refused by the current compiler.

Malformed values, unknown fields, extra explicit-rule fields, conflicting profiles
and nonempty private avoid points refuse instead of being coerced or dropped.
This settings-only interface deliberately rejects full routing bodies containing
coordinates, cost inputs or client proof claims. Callers must explicitly construct
the supported settings contract; it is not safe to filter unknown fields silently.

Scenic/quiet, optimization and detour selections remain in the supplied settings,
fingerprint and supplemental UNVERIFIED report. The existing app applies detour
as a route-variety preference, with exceptions in `route_variety.py`; this adapter
does not claim a strict detour bound. Include-cost flags remain distinct from
avoidance flags. `app_integration_allowed` and `navigation_allowed` remain false.
A registered-case preview is not evidence of general preference enforcement.

## Isolated service contract

Pass the adapter's `policy_request` with an additional `app_settings` member equal
to its retained `app_settings`. The existing authenticated `/api/prototype/policy`
and `/api/prototype/route` endpoints accept this richer policy. The compiler
re-derives all 13 canonical rows and the profile from the supplied settings, and
rejects any disagreement with `app_settings_policy_mismatch` (HTTP 400). The app
settings object is never used to change registered coordinates or Java models.
Unsupported mandatory exclusions return HTTP 422 before Java or cache lookup.
No extra endpoint or real-app activation is introduced.

The policy report retains the settings and supplemental UNVERIFIED preferences.
The selected policy fingerprint, request binding, process-local raw-evidence cache
key and schema-2 plan reference include the entire settings object. Each cache hit
and restore recompiles and independently revalidates raw route evidence. Changing
a setting cannot reuse another settings binding. Editing saved settings without
updating the reference binding returns HTTP 409; even a newly bound reference
cannot override an unsupported mandatory rule. References are selectors, not proof
or authentication credentials. Navigation remains disabled throughout.

Fresh manifests must include hashes of the settings adapter and shared avoidance
contract; these hashes also enter `policy_version`. Missing or changed identities
refuse before cached evidence can be returned. Existing manifests and references
are not silently upgraded. The isolated container packages both source files
without importing production services. Deployment remains a separate approval.

The standalone viewer now accepts richer references and a separate synthetic
full-settings mode. Raw settings preflight returns the canonical policy, which the
browser independently checks before routing or restoring; see POLICY_UI.md.
The real UK UI connection and production cache/saved-store integration remain
pending. Request size limits, authentication and Origin checks are unchanged.

Validation covers the actual JavaScript shared request builder using synthetic
settings without location/storage input, strict normalization, exemptions, source
identity, HTTP preflight/refusal, cache revalidation and reference restoration.
The container smoke additionally checks rich-policy round trips. These are
synthetic tests; no phone acceptance, VPS change or deployment is established.
Milestone 3 remains in progress.
