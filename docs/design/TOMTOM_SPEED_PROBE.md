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

## Confirmed request failure

The configured VPS returned HTTP 400 / INVALID_REQUEST identifying
`{route.properties.roadNumbers}` as an unknown requested field. Both detector and
probe now omit that field. The parser still tolerates road numbers in older
responses, but an absent value yields no provider road classification; no class
is guessed from the numeric limit. Client-edge plausibility checks remain. A
new live request is required to establish whether the corrected request succeeds;
this correction does not integrate TomTom into the normal widget.

A second live VPS response identified `{route.properties.streetName}` as unknown
too. Requests now select only `{route{properties{speedLimits{value,unit,type}}}}`.
The probe prints only bounded `detailedError.code`/`message` strings on rejection,
redacting raw and URL-encoded keys. This avoids repeating the diagnostic wrapper.
The reduced field selection still requires live validation; no successful TomTom
response or widget integration is claimed.
