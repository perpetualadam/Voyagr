# Phase 12F-D — M3/M4 preview ownership races

**PRODUCTION_NO_GO.** Implementation is ready for independent re-review, not independent merge or production acceptance.

## Exact starting point

Existing PR #375 branch `codex/phase12fd-navigation-coherence` was clean and its remote head exactly `90ee2cefcd2cae86ffef567a4d24ee2e28a509bd` before editing. Parent: `84c056e71007514fa0d56e0fa59c1cdd62cccbb8`. The remote head was rechecked before committing. No baseline substitution or rebase.

## Reproduced causes

- **M3:** A preview's stale catch handler removed by source/layer ID after reentrant rendering had transferred those IDs to a newer successful preview. Ownership checks protected creation but not removal. Array-wide filtering during cleanup could also overwrite a list changed by a renderer callback.
- **M4:** The scheduler checked its captured generation once, but subsequent batch steps minted handles from the then-current generation. A callback invalidated during its first write could therefore erase the successor and render its remaining stale options under the successor's generation.

The unchanged starting point was independently replayed in a disposable harness: **15 cases, 13 passed / 2 reproduced failed expectations / 0 blocked**. In M3 the newer preview returned true with two actual lines, then obsolete cleanup removed its first line while leaving an added ownership record. In M4 current options became `[C]` but only the obsolete `route-layer-1` / `route-source-1` survived. Inputs are synthetic, with synchronous renderer-event reentry; no ordinary deployed UI frequency is claimed.

## Ownership and cleanup design

Preview resource owners are private per-map records keyed separately by source ID and layer ID. Each slot binds a particular handle and its original immutable batch token. Public IDs or the latest global generation alone do not authorise removal.

Cleanup checks that exact handle/token/generation before each resource mutation and rechecks ownership after renderer calls. When a newer owner has taken an ID, obsolete cleanup skips the successor's resource and slot. It can still remove resources belonging to the obsolete handle's own original slot, even after that batch has been invalidated. Failed physical removal retains the slot and handle; cleanup never reports unresolved owned resources as released.

A per-handle cleanup-in-progress guard makes synchronous recursive cleanup refuse instead of recursively deleting or falsely succeeding. Cleanup edits the live handle list by exact identity, not by assigning a filtered copy of an obsolete snapshot. A verified release sets the old handle's added flag false and removes only that old record. A return of true from an already released old handle means its own resources are released; it does not mean a successor's resources sharing the IDs should be absent.

## Immutable batch design

A batch receives one frozen, privately recognised token carrying its original map and generation. Scheduler callbacks, planning, batch iteration and each source/layer write carry that same object. Expired or fabricated tokens refuse; no fallback substitutes a new generation for a supplied old token.

The batch checks its token before and after each step and aborts the remainder when invalidated. Post-mount effects and queued ordering/debug callbacks retain the token too, preventing obsolete presentation work after a newer preview. Single-route preview checks guard reentry around renderer work and later traffic-state writes; obsolete uniquely owned renderer resources are removed or retained with explicit inconsistent-map failure if cleanup cannot complete. This closes the same race across the alternate preview path without changing navigation safety policy.

Current-generation rendering and deferred mounts remain usable. All changes are in presentation/resource lifetime handling; no substitute safety gate, routing request change, threshold change or native evidence is introduced.

## Executed verification

Environment: Node v24.19.0, Python 3.12.14, Jest/jsdom and an explicit MapLibre API model using actual production MapLibre helpers, comparison, lifecycle, verifier and planners. Positive controls complete navigation and verify actual mounted geometry. Failure tests inspect ownership records, sources/layers, selection, identity/assessment, instructions, progress and navigation flags.

Evidence remains outside Git under `/tmp/voyagr-m3-m4`. Original independent/private evidence is unchanged. Unexpected external harness fetch/XHR calls throw; GPS controls use explicit synthetic responses. Backend runs deny outbound sockets and use disposable SQLite. No live routing or private captures.

| Check | Exact result |
| --- | --- |
| Original independent race suite before edits | 13 passed, **2 failed**, 0 blocked; 15 total |
| Original two race scenarios after correction | **2 passed**, 0 failed |
| Entire independent race/cleanup suite after correction | **15 passed**, 0 failed, 0 blocked |
| New M3/M4 regression suite | **19 passed**, no skips |
| Existing M1/M2 ownership suite | **20 passed**, no skips |
| Independent cascading/positive matrix, including original three and twelve | **44 passed**, 0 failed, 0 blocked |
| Independent F2/F3/original-seven/lifecycle/IndexedDB matrix | **183 passed**, 0 failed, 0 blocked |
| Full lint:tests | Passed |
| Full JavaScript / coverage floors | **107 suites / 2278 tests passed**, no skips |
| Focused Python avoidance/origin/Valhalla safety selection | **174 passed** |
| Full configured backend CI selection | **1611 passed, 1 skipped, 68 subtests passed** |

The backend skip requires actual Windows handles on disposable CI fixtures. Desktop/Kivy/native/live-service tests outside the configured web selection were not run.

New coverage includes both original failures, reused IDs, layer/source cleanup reentry, invalidation during the first source write and between later writes, three overlapping generations, queued callbacks after reconciliation, failed source/layer removal with stopped startup and successful recovery, valid traffic-on/off previews/navigation, direct release consistency, single-route and post-mount reentry, queued ordering callbacks, and expired/fabricated tokens and a runtime unbound before queued callback release. No blank map, missing infrastructure or failed bootstrap is counted as a positive navigation control.

An intermediate expanded run had two failures: one test reused a shared service spy, and a new queued-ordering test exposed an unforwarded batch token. The service spy was isolated and the token forwarded; A final teardown test also reproduced an unhandled callback when its runtime was unbound; token validation now refuses that state without throwing. All final suites were rerun successfully. No endpoint, avoidance or safety assertion was weakened.

The unchanged four origin/destination endpoint boundary controls still allow 1.999 m and refuse 2.001 m. Mandatory avoidance, strict synchronous verifier decisions, F2/F3, R1–R8, M1/M2, geometry binding and IndexedDB resume safeguards retain their coverage. Routing/provider requests, camera logic and native correlation rules are unchanged.

## Exact changed files

- `static/js/app/route-comparison-orchestration.js`
- `static/js/__tests__/preview-ownership-races.test.js` (new)
- `templates/index.html` (comparison script query version only)
- `docs/audits/VOYAGR_PHASE12FD_PREVIEW_OWNERSHIP_RACES.md` (new)

## Limits and independent-review readiness

Persistent renderer failures can leave explicitly owned unresolved resources. Preview/start/transition must refuse or guidance must remain stopped until verified recovery; reload may be necessary. Synchronous reentry is tested deterministically at renderer boundaries, not observed in a deployed browser session. Real WebGL/style reloads, device GPS/background/speech, storage stalls and mixed service-worker delivery remain integrated PWA acceptance blockers. A versioned script reference is not proof of atomic delivery.

No private recorded fixture 0 captures were supplied or executed; no native correlation or production acceptance is claimed. Another independent review should challenge owner transfer during cleanup, partial removals, multiple nested generations, queued callbacks and full valid navigation on the final head.

No merge, auto-merge, deployment, VPS work, live routing or native Android/Kivy work. **PRODUCTION_NO_GO.**
