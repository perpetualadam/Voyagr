# Multi-tab immutable-asset bootstrap investigation

The privacy lab twice failed before cross-tab history withdrawal on 9ccc7034.
The second tab's release guard saw missing predecessors (first incoming 26 after
completed 19; then incoming 90 after completed 88). No HTTP non-200 asset response
was reported. The diagnostic-only 7ce45ea7 subsequently passed the full privacy lab,
including a repeated run. These passes did not establish that the issue was fixed.

A smaller local probe using the actual rendered template, immutable asset builder
and service worker reproduced a script-chain gap without any account services.
An initial worker-enabled run failed at tab six with a public script request marked
`net::ERR_ABORTED`; another failed at tab seven with multiple script cancellations.
The equivalent worker-blocked comparison completed twenty tabs. A temporary
experiment returning materialized verified cached bytes completed twenty tabs,
and the repository's resulting narrow change completed another twenty with every
expected script completed and no failed asset request.

The mitigation detaches cached bytes from the CacheStorage response stream before
returning them to a document. Digest verification still runs first. Response status
and headers are retained, except content encoding/length headers describing the
original wire representation of already-decoded bytes. Network retrieval, one
bypass retry for stale successful bodies, SRI, release ordering and fail-closed
behavior are unchanged. No caches, IndexedDB or localStorage are cleared; worker
activation is not forced and existing tabs are not reloaded.

A deterministic worker regression simulates a cached response becoming unreadable
after delivery and verifies the returned materialized body remains readable. It
also checks content/security/cache headers and absence of forced activation or
cache deletion. Existing corrupt-body and interrupted-release tests remain active.
The reusable bootstrap-probe.py / bootstrap-probe.cjs retains the local reproduction
procedure; normal privacy assertions and sanitized diagnostics are unchanged.

Limits: the precise Chromium/CacheStorage cancellation mechanism is not proven.
The probe comparison supports a cached-response delivery mitigation, not a claim
that all bootstrap failures or the earlier physical-phone map loss are explained.
Full privacy/browser CI must pass on the final commit. No production or VPS change
and no physical-phone test has been performed. A future approved worker deployment
must retain normal waiting/activation behavior and existing browser storage.
