# Direct TomTom speed check

The normal widget does not call TomTom. The legacy API tries TomTom before OSM,
but a combined API result cannot establish which upstream request succeeded.
`tests/test_tomtom_apis.py` is an older combined-provider smoke script; it is not
a direct provider test and its expected public-road limits are not authoritative.

Run the new probe on a machine with the application dependencies and a local key:

```sh
venv/bin/python scripts/probe-tomtom-speed.py --env-file .env
```

One request uses a public Shambles Street point and the same request fields as the
current detector. It reports HTTP status, route/limit field shapes and whether a
positive value fits the current parser. It does not query Overpass, invoke the
application, write application data or print credentials, bodies or request URLs.
It consumes one provider request. No key means exit 2 / NOT TESTED; network, HTTP
or incompatible/missing response fields mean exit 1. A compatible result exits 0.
A successful probe does not prove current signage, snapping correctness, full
unit/type interpretation, legal applicability, or widget integration. In
particular, the existing detector assumes metric values; full provider unit/type
and segment selection need separate evidence before changing that parser.

Local mocked detector tests cover a compatible 48 km/h response becoming 30 mph
and an HTTP 403 remaining a failure. There was no live key in the development
workspace; live provider functionality remains unverified until this probe runs
on the configured host. Do not paste an API key into chat or diagnostic output.
