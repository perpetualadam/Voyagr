# Selected-route strict metadata transfer

This branch-only source change closes the field-propagation gap recorded in
[REAL_APP_CONNECTION_AUDIT.md](REAL_APP_CONNECTION_AUDIT.md). It does not enable
strict mode, change production configuration, deploy code or update VPS2.

## Source change

`static/js/modules/navigation/route-selection.js` now takes `routing_context` and
`navigation_allowed` from the selected candidate in both:

- `mergeNavigationRouteFromSelected`, alongside the selected identity, geometry
  and assessment;
- `mergeLastCalculatedRouteFromSelection`, overriding any older base value even
  when the new candidate omits those fields.

No value is upgraded, defaulted to true or inherited from the old route. Missing
metadata remains missing and is refused by the opt-in strict gate. Existing
restored-journey inspection guards still return the inspection context unchanged.
There is no new authority issuer, bootstrap flag, route-provider call or storage
mutation. Default-mode eligibility continues through its existing gates.

## Regression evidence

Twenty added synthetic cases exercise both real merge helpers with the real
shared strict/legacy gate and candidate preparation. They cover old-valid versus
new-refused, absent permission/context, new-valid versus old-refused, each changed
graph/source/policy/request identity, and expired evidence. Two cases also enter
the actual lifecycle Start transaction with different old/selected permission
flags, checking refusal without state mutation and a coherent positive commit.
Inputs remain unchanged by the merges.

Before the source fix, 13 of the new cases failed. Afterward, the focused strict
and existing selection/saved-context suites passed 137 tests. Full JavaScript
validation passed 200 suites / 3,884 tests, with lint passing. The existing
backend workflow selection passed 2,548 tests, one skip and 94 subtests. Fixtures use synthetic
metadata, device doubles and MapLibre test boundaries; no physical navigation,
production data or live routing service is involved.

```sh
npx jest --runInBand static/js/__tests__/gh11-strict-navigation.test.js \
  static/js/__tests__/phase12fd-selection-saved-context.test.js
npm run lint:tests
npm run test:ci -- --maxWorkers=2
```

The dedicated GH11 workflow now also triggers on changes to this merge module
and its strict regression file. Check the exact-head CI results for required
backend, frontend, Java 17 and container checks; prior-head results do not replace
those checks.

## Remaining migration gates

The real response/maneuver adapter, canonical settings/coverage authority,
versioned private-cache integration and owner-scoped saved-store integration
remain incomplete. The standalone viewer still cannot authorize navigation.
Deployment and phone acceptance of this source change are unperformed.
Milestone 3 remains in progress; production migration remains NO-GO. The next
bounded implementation is the response-contract adapter, retaining preview-only
scope until navigation prerequisites can actually be established.
