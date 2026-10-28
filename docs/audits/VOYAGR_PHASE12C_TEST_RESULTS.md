# Phase12C — Test results and inventory

**PHASE12C_PARTIALLY_VERIFIED. CANDIDATE_NOT_VERIFIED. Production NO-GO.** No production probing, deployment, replacement, rebuild or service change. GraphHopper-first eligible primary ordering and all independent mandatory gates remain unchanged.

## Executed versus outstanding

| Selection / evidence | Result |
|---|---|
| Configured web backend list plus new acceptance file | 1079 passed,68 subtests |
| New acceptance regressions |168 passed within backend selection |
| Jest with existing coverage thresholds, maxWorkers2 |99 suites,1924 tests PASS |
| Test lint | PASS |
| Isolated PostgreSQL SQL policy |11 tests PASS |
| Candidate CLI reproducibility verification | VERIFIED_REPRODUCIBLE, unchanged SHA |
| Offline default runner |128+128 NOT_TESTED area statuses,0 HTTP calls |
| Official checksum-verified GH8 JSON/JTS | candidate128 / mixed140 valid; original102 invalid as expected |
| Actual installed profile expression compilation | NOT_TESTED |
| Paired road-edge/hard-zero/boundary/no-path routing | NOT_TESTED |
| Real engine latency/CPU/RSS/import/startup | NOT_TESTED, n=0 |
| Contabo active137 source and runtime import identity | NOT_TESTED |
| Physical-device / full release acceptance | NOT_TESTED |

Baseline before additions:911 backend tests/68subtests. New tests exercise the actual acceptance module, not an alternative implementation: all128 exact expressions; default no-network; missing approval; remote/production/credential URL refusal; source hash; area collisions/multiple IDs; model errors versus no-path and HTML/provider failures; complete segment crossing, boundary and holes; optional edge oracle; sanitized comparison; batch counts; ignored rejection controls; empty fixtures; baseline relation; expired/capped budgets; late response/no retry; malformed JSON; wrong version; fresh complete encoded metadata receipt; missing manoeuvres remain unverified. Fake transport outputs exist only in unit tests and are not engine evidence. No demonstrated routing behaviour defect was identified or speculatively modified.

Existing application suites preserve GraphHopper-first eligibility despite higher nearby-marker count, mandatory uncertainty, cache reassessment, provider fallback, geometry/multi-stop, source/direction/freshness, capability-aware toll, area collision, deadline, Overpass and browser integrity protections. They do not prove production deployment or graph-backed compliance. No assertions, coverage thresholds, required jobs or safety gates were weakened. The CI change only adds the new test file to the existing backend job. Desktop/Kivy/custom-router/live-service selections outside configured web CI were NOT_EXECUTED.

## Reproduction

```bash
# Use the exact file list in "Run Python behaviour tests" in .github/workflows/ci.yml:
.venv/bin/python -m pytest -q <configured-file-list>
npm run lint:tests
npm run test:ci -- --maxWorkers=2
.venv/bin/python scripts/test-dashcam-session-sql.py
.venv/bin/python scripts/repair-camera-areas.py --output-dir artifacts/camera-areas/phase12b --verify
.venv/bin/python scripts/accept-phase12c-graphhopper.py
.venv/bin/python scripts/validate-phase12b-parser.py --jar-dir /tmp/voyagr-gh8-parser
```

The SQL tool creates temporary local PostgreSQL only; never supply production DSNs. Parser command needs the six official checksum-matched libraries listed in existing `VOYAGR_GRAPHHOPPER8_PARSER_EVIDENCE.json`. See operator report for actual graph prerequisites and bounded approved commands.

Hosted required jobs are Backend (pytest), Frontend (Jest + coverage), Dashcam session SQL policy; strict base freshness, squash and zero required approvals were read through effective main rules. Repository permits auto-merge. The classic protection endpoint is integration-restricted; effective rules were available. Final PR/merge/main CI status and SHA are recorded by GitHub and the final delivery, not predicted in this pre-commit document. CI-log redirect host is blocked by network policy; no bypass was attempted. Check API/annotations remain available for required-job diagnosis.

## Complete changed-file inventory

19 files (original and candidate datasets unchanged):

- `.github/workflows/ci.yml`
- `voyagr/utils/graphhopper_acceptance.py`
- `scripts/accept-phase12c-graphhopper.py`
- `scripts/fixtures/phase12c/plan-template.json`
- `tests/test_phase12c_acceptance.py`
- `docs/audits/VOYAGR_PHASE12C_ENGINE_DISCOVERY.json`
- `docs/audits/VOYAGR_PHASE12C_OFFLINE_DISCOVERY.json`
- `docs/audits/VOYAGR_PHASE12C_PARSER.json`
- `docs/audits/VOYAGR_PHASE12C_ENGINE_DISCOVERY.md`
- `docs/audits/VOYAGR_PHASE12C_AREA_COMPILATION.md`
- `docs/audits/VOYAGR_PHASE12C_GRAPH_ENFORCEMENT.md`
- `docs/audits/VOYAGR_PHASE12C_ORIGINAL_CANDIDATE_COMPARISON.md`
- `docs/audits/VOYAGR_PHASE12C_128_137_RECONCILIATION.md`
- `docs/audits/VOYAGR_PHASE12C_PERFORMANCE.md`
- `docs/audits/VOYAGR_PHASE12C_CONTABO_OPERATOR_ACCEPTANCE.md`
- `docs/audits/VOYAGR_PHASE12C_TEST_RESULTS.md`
- `docs/audits/VOYAGR_PHASE12C_RELEASE_DECISION.md`
- `docs/audits/VOYAGR_REMEDIATION_PLAN.md`
- `docs/audits/VOYAGR_FINAL_TECHNICAL_REPORT.md`
