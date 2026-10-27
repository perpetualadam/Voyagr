# Dashcam external review follow-up

## Scope and review interpretation

The submitted external review is a risk summary/PR description, not a specific exploit report. Authentication changes, session-policy installation and proxy/static isolation are legitimately high-risk boundaries, but that label alone does not establish an authentication bypass. Investigation started from main commit a6c4b2e72ea7032f39b6e56d752cea09f0c0e353, on a dedicated feature branch. No production data, configuration or deployment was changed.

I traced the owner/JWT/session gates, file containment and inline browser capture lifecycle, then wrote deterministic tests against the real inline control code. Three initial regression cases failed on the original code (15 passed), demonstrating three concrete browser defects rather than an unsubstantiated server-side vulnerability. A further targeted run against the original merged template reproduced GPS submission after switching to device-only capture (one failed test, 19 other cases filtered out by test name); the normal final full suite has no skipped cases. The baseline replay substituted the read-only git-show template in the test file reader without altering application files.

## Confirmed defects and changes

| Finding | Severity | Reproduction / consequence | Fix |
|---|---|---|---|
| REVIEW-01 | P1 | Hold /start response.json pending, sign out, then resolve a successful start body. The auth-change listener sees isRecording=false and does not stop startup; the recorder subsequently starts after sign-out. Pending camera tracks were not registered for immediate cleanup. | Track the pending media stream, cancel private startup on account change, stop pending tracks immediately, recheck identity after parsing the response body, and check cancellation before recorder creation. Cancellation remains effective if the user switches away and back to the same account. |
| REVIEW-02 | P1 | Start, stop and restart within five seconds. The first GPS timer has not yet observed the stopped state; on its next tick it sees the new active recording, so both timers collect/upload metadata. Switching instead to device-only capture can inherit the old server timer and transmit GPS despite the no-upload mode. | Store one metadata timer handle, explicitly clear it on stop/media release and before replacement, and retain the existing stale GPS callback recording-ID check. |
| REVIEW-03 | P1 | MediaRecorder initialization fails after a successful server start. Rollback calls POST /stop without recording_id. If another tab has removed/replaced the first session, rollback targets the owner's current active session instead of the one that failed. | Capture the started ID and include it in rollback JSON. Skip automatic rollback when that ID is unavailable; never substitute another active session. The existing server owner-and-ID check then prevents stopping a replacement recording. |

These defects do not demonstrate anonymous or cross-user server access: identity-pinned uploads and backend owner checks remain in place. REVIEW-01 is a camera/capture lifecycle privacy defect; REVIEW-03 affects distinct recordings owned by the same account.

## Server-side checks

The existing API still requires signed Supabase JWTs and an online own-session check, rejects missing/unavailable verification, filters recording operations by verified owner and quarantines NULL-owned legacy rows. Existing negative authorization/storage tests pass unchanged. No server-side policy was relaxed or credential introduced in this patch.

The pinned GoTrue v2.158.1 source confirms that logout deletes auth.sessions rows, consistent with the RPC's existence check:

- https://github.com/supabase/auth/blob/v2.158.1/internal/api/logout.go
- https://github.com/supabase/auth/blob/v2.158.1/internal/models/sessions.go (Logout, LogoutSession, LogoutAllExceptMe)

This is source verification, not a claim that the live deployment has applied the RPC or has correct proxy/storage permissions. The migration and deployment acceptance requirements from VOYAGR_DASHCAM_SECURITY_REMEDIATION.md remain mandatory. Real-device permissions/download behavior is still unverified.

## Validation

The new/strengthened browser regressions cover exact-ID rollback, sign-out while the start body is pending, immediate pending-track cleanup, account switch away-and-back cancellation, rapid stop/start GPS timer replacement, and no inherited GPS submission when switching to device-only capture. Tests exercise actual inline controls with mocked camera/network boundaries; no real camera or production session is used.

After fixes: full selected Python suite **538 passed + 68 subtests** (6.40s); full Jest suite **88 suites / 1,800 tests passed** (3.634s); actual SQL-policy script on isolated PostgreSQL **11 tests passed** (0.770s). No final selected-run failures or skipped tests were reported. Existing test lint, coverage thresholds and git diff checks pass. Backend and SQL tests are unchanged and rerun as regression checks; scoped Jest coverage is not whole-application or real-device coverage.

Hosted PR CI status and merge outcome are reported separately; local results are not represented as hosted CI results. Overall production status remains NO-GO for pending deployment acceptance and the separate navigation safety concerns.

## Files

- templates/index.html: startup cancellation, pending stream cleanup, exact-ID rollback and explicit metadata-timer lifecycle.
- static/js/__tests__/dashcam-private-access.test.js: reproducible regressions against actual control code and a persistent media-track test boundary.
- This report and a linked follow-up note in the existing dashcam remediation report.
