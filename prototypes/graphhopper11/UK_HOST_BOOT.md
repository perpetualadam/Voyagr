# Explicit loopback UK host connection

`VoyagrGH11UKHostBoot.connect({hostWindow,previewWindow})` replaces the separate
manual owner and journey binding calls for an isolated test host. Both windows
must have the same HTTP(S) loopback origin (127.0.0.1, localhost or IPv6 loopback).
Production origins and cross-origin frames are refused before identity is read.
The module is a source-hashed, authenticated preview asset; no UK script tag,
automatic discovery, boot callback, opener, postMessage or server setting is added.

The host must already expose the real owner coordinator, journey modes protocol 1,
ready lifecycle protocol 1 and GPS accepted-origin API. The preview must already
have its registered cases/configuration ready, saved-session and journey bridge.
The connector reads the supplied globals, validates contracts and subscribes via
the existing read-only host adapter. It binds the separate preview database's owner
scope and journey evidence together. No ready/db/migration, getSession/login,
position request, navigation start/stop or routing-engine selection is invoked.

Source identities are checked on every owner/evidence read. Replacing any host
module invalidates context, even without a notification. The owner facade reads
only capture/current; it is not authentication. Partial connection failure closes
the preview session and unsubscribes adapter callbacks. It does not delete records
or change the host. Close is idempotent and fail-closed; reconnecting that preview
requires a fresh page, so closing cannot silently fall back to an unbound preview.
Explicit refresh remains available for geometry/uncertain lifecycle changes.

Unit tests cover origin/readiness/protocol refusal, ownership propagation, module
replacement, close and partial failure. Viewer integration uses the actual separate
store (fake IndexedDB), GPS acceptance/notification, shared GPS validator, real
journey intent clock and lifecycle implementations with explicitly synthetic LIVE
state. It renders a registered preview then clears it on accepted GPS change,
without reading host collections or migrating data. Route transport is mocked in
that deterministic test. The fifth Chromium scenario exercises the packaged boot
connector and actual GH11 restore using synthetic host globals and real IndexedDB;
it does not load a physical phone or live account. Six Java executions/validations
remain required by that scenario.

This supplies an explicit executable test connection, not production UK boot
activation or a full UK-app/browser acceptance test. The current guard requires an
active, non-simulated live journey; planning-mode UX/general GPS-origin routing are
not enabled by this connector. Cross-origin UK-site/localhost-preview connections
are deliberately unsupported. Full UK host-page setup, route-generation/geometry
notifications, legal/hazard/stop parity, physical-phone checks and rollback remain
pending. No production configuration, saved journey, device profile or VPS was
accessed. Milestone 3 is in progress; production migration remains NO-GO.
