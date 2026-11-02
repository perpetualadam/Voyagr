# Stale journey inspection asset: 2 November 2026

Operator evidence from the isolated vmi3072171 browser lab shows that the public
page requests `/static/js/modules/navigation/journey-plan.js?v=20261031phase12fgremediation`.
That response lacks both maneuver-fix markers and carries
`Cache-Control: public, max-age=604800, immutable` with `Age: 66038`.
The unversioned public URL contains the shared-validator marker. The loaded
integrity module contains the helpers; all 66 maneuvers pass the current checks.
The executed inspection function lacks both helpers. Blocking service workers
produces the same result. These observations establish stale versioned code in
the HTTP response path; they do not identify the particular cache operator.

## Repository correction

Change the four script URLs modified by PR #380 to
`v=20261102maneuvercontract1`: journey-plan, avoidance-integrity, route-selection,
and calculate-route-orchestration. New keys avoid the observed stale URLs when
query strings participate in cache keys. No validation or navigation gate changes.
The existing canonical Nginx configuration already uses `^~ /static/js/` and
`^~ /static/css/` with `no-cache, must-revalidate`; no duplicate policy is added.

## Operator deployment and verification (not executed)

1. Review and deploy the approved application revision through the existing
   deployment process. The lab hostname is not the production application host;
   do not run production deployment commands on the lab.
2. On the confirmed application host, compare the active `nginx -T` configuration
   with `deploy/nginx-vibevoyager.org.conf`, including its security headers snippet.
   Apply the reviewed revalidation policy through the normal configuration process;
   validate with `nginx -t` before reloading. Do not replace the whole site blindly.
3. In the configured cache/CDN control panel, invalidate the old journey-plan URL
   and cached application HTML. If that cache ignores query strings, invalidate
   the journey-plan path as well. Verify JS/CSS cache rules honor origin
   revalidation instead of overriding it with immutable caching. No cache vendor
   or purge API has been established here.
4. Confirm the public HTML references all four new script URLs. Fetch the exact
   new journey-plan URL and verify its body contains `validManeuverInstructions`
   and `isEdgeMetadataManeuver`. Inspect all Cache-Control headers: the intended
   policy is `no-cache, must-revalidate`, without an immutable directive. Verify
   avoidance-integrity exposes both helpers.
5. Rerun the existing assets diagnostic with service workers blocked, then allowed.
   Require the loaded journey-plan response to contain both markers and the
   maneuver exception to disappear. Confirm the route preview renders: the probe
   only records inspection exceptions and cannot alone establish full success.
   Keep live navigation refusal and endpoint-integrity checks unchanged.

No production deployment, cache purge, configuration reload or browser-storage
clearing is performed by this patch. Runtime helper markers identify the fix
shape, not a complete revision hash.
