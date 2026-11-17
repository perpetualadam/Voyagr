# Van life and camping POIs

The existing POI search now includes a Van life & camping disclosure for nearby
search and corresponding along-route buttons. Parking reuses the existing
parking search. Selecting a result plans a route to the mapped point; it does not
start navigation or add an intermediate stop automatically.

| Filter | OpenStreetMap selectors |
| --- | --- |
| Campsites | `tourism=camp_site` |
| Motorhome / caravan sites | `tourism=caravan_site` |
| Drinking water | `amenity=drinking_water`; `man_made=water_tap` or `amenity=water_point` with `drinking_water=yes` |
| Toilets | `amenity=toilets` |
| Showers | `amenity=shower` or `shower=yes` |
| Waste disposal | `amenity=sanitary_dump_station`, `sanitary_dump_station=yes`, or `amenity=waste_disposal` |
| Laundry | `shop=laundry` |

Explicit non-potable water is excluded. General waste disposal is distinguished
from sanitary disposal. Accepted chemical-toilet/greywater/blackwater tags are
reported separately when mapped; a dump-station tag does not guarantee every
waste type is accepted. Ordinary motorhome-compatible parking is not relabelled
as an overnight site. Site type and reported access do not grant overnight or
camping permission, confirm availability, or establish vehicle suitability.

Result cards expose reported facilities, fees, hours, seasonal opening, access
conditions and height/width/length/weight restrictions when present. Missing
values remain unknown. Provider text is escaped before rendering, and map points
may be centroids rather than entrances. Existing arrival/access review remains.

The seven new categories use the existing configured Overpass transport, cache
and deadlines directly. Established POI categories retain their provider order;
TomTom speed-limit priority is unchanged. New categories do not fall through to
generic fuel or unclassified geocoding results when Overpass fails.

Nearby UI uses its existing 3 km radius (API maximum 5 km), returns at most 15
candidates and measures straight-line distance. Along-route UI retains its
existing 1 km corridor search with at most three sampled points and 20 results;
coverage is incomplete and offsets are not driving detours. Queries cap output at
200 elements / 2 MB and seven seconds; acquisition has a 12-second work budget.
Nodes, ways and relations are supported; invalid, duplicate and out-of-radius
records are rejected. Dataset/cache provenance remains in search_context.

Validation uses synthetic Overpass transport and controlled Chromium fixtures;
no production configuration, database, browser storage or provider was modified.
Run `pytest tests/test_camping_poi.py`, the normal frontend suite and
`node scripts/check-camping-poi.cjs`. Physical-phone acceptance follows deployment.
