# Milestone 2 operator and Pixel 6 acceptance

Evidence supplied by the operator in this conversation on 2026-11-22. These are
reported server results and phone screenshots, not an independent SSH inspection
or an unperformed driving test. No credentials or private journey history are
recorded here. All routes below are registered public OSM fixtures.

## Running release and identity

- Code export: `2c11e4927157a8d12032049e9204f26ef9f00ceb`.
- VPS2: `vmi3072171`; separate container `voyagr-gh11-app-preview`.
- Rebuilt and smoke-tested VPS2 image:
  `sha256:be4c9bc0e0600d14291a8cb57c8b20d86ec4f1cbe5771eecdd0c5ec440344268`.
- Runtime inspection: running, network none, read-only root, UID 10001:10001.
- Private snapshot: `/opt/voyagr-gh11-app-preview`; six registered cases.
- Graph: `993a1b0c79ec5a2addfa84afc27363cb7f4d618cb64ce0005bfbad7b60e5af7d`.
- Historical source: `20d0e39cb555b457126d47903a084cc9b7b79d49345b601b3c4e1887fda385cf`.
- Policy: `60f679e5c65c491f0a94abcf87c0a3968b0261942b1f8f3f9d6f8bb25a4ccded`.
- Authenticated readiness and anonymous/authenticated viewer checks passed.

The image ID differs from the local build because of build metadata. The operator
built the pinned source with digest-pinned bases/hash-locked wheels and repeated
the generated-graph container smoke before starting it. Existing GH8/UK production
were not changed by these commands. Current VPS2 resources remain operational
observations, not a capacity benchmark.

## Actual UK service results

| Case | HTTP | Returned result |
| --- | --- | --- |
| a61_primary | 200 | 3.227 km, 60 directed edges, zero selected forbidden traversals |
| a61_alternatives | 200 | One route, 3.227 km, 60 edges, zero forbidden traversals |
| a61_continuous_via_mainline | 200 | 3.227 km, 60 edges, zero forbidden traversals |
| a61_provider_reroute_from_mainline | 200 | 2.935 km, 59 edges, zero forbidden traversals |
| original_exit_endpoint_refusal | 422 | Expected engine refusal; no candidate |
| downstream_exit_chain_refusal | 422 | Expected engine refusal; no candidate |

All response versions matched the recorded manifest. Navigation stayed disabled.
The refusal interpretation also uses the earlier complete local incoming-edge
inspection; the bounded search result alone is not proof of route absence.

## Physical browser checks

Pixel 6 / Android 14, Chrome, reached the private Unix socket through a Termux SSH
tunnel bound to phone loopback port 18511. Login and registered-case loading
worked. The screenshots show:

- `a61_primary`: Route 1, 3.227 km, visible blue route geometry and 14 instruction
  rows. The viewer is a geometry plot, not a base-map or navigation renderer.
- `original_exit_endpoint_refusal`: Request refused (422), empty returned-route
  selector and cleared geometry. The previous successful route was not left
  displayed under the refused case.

These complete milestone 2 for this registered-case preview prototype. They do
not establish real navigation, warnings while driving, three distinct UK
alternatives, automatic deviation detection, current hazard coverage or general
legal/turn/stop correctness. Production migration remains NO-GO.

## Subsequent development boundary

Milestone-3 code changes are not installed in this running release. Its schema-1
manifest and image remain unchanged. New browser-bound manifests use schema 2;
a future image requires a new manifest and reviewed update steps. Do not combine
new validator code with the recorded old manifest or silently replace this service.
