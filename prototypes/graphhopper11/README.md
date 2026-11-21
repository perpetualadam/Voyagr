# Isolated GraphHopper 11.1 prototype

This is a local experiment, not a routing service or migration switch. Nothing
in the UK Flask application imports it. It opens no listener, has no provider
URL, downloads no map data, and imports only a generated five-node OSM XML
fixture in a fresh temporary directory. The runner has no network code.

## Pinned runtime

Official release: https://github.com/graphhopper/graphhopper/releases/tag/11.1

Artifact: `graphhopper-web-11.1.jar`

SHA-256: `8462f758d9ea49edaded557cec5c687a0a24f004ec371cd4daaeb0534824ea33`

Use a full Java 17+ JDK with source-file launching. GH11.0 must not be substituted:
https://github.com/graphhopper/graphhopper/security/advisories/GHSA-mg8w-mq9r-f9c6

No binary is committed. Supply an independently downloaded official artifact:

```sh
.venv/bin/python prototypes/graphhopper11/run.py --jar /path/to/graphhopper-web-11.1.jar
GH11_PROTOTYPE_JAR=/path/to/graphhopper-web-11.1.jar \
  .venv/bin/python -m pytest -q tests/test_gh11_prototype.py
```

Without that environment variable the real-engine test is explicitly skipped;
adapter tests remain offline. The separate prototype CI job downloads only the
checksum-pinned runtime and uses Java 17. No production secret is required.

## What is exercised

`DirectedGraphProbe.java` imports three named bidirectional corridors between
the same endpoints, enables the car profile and turn-cost machinery, and disables
CH/LM. An isolated Java `WeightingFactory` decorator gives selected directed
edge keys infinite cost. Each weighting owns an immutable request-specific set;
the base graph is never mutated to change restrictions.

This is a Java extension, **not** a claim that the stock REST custom-model DSL
supports arbitrary edge-key exclusions. Virtual iterator wrappers must be
detached to resolve their original directed edge keys before applying exclusions.
The forward and reverse virtual-endpoint regressions guard that requirement.

GH's native alternative search need not discover all three available corridors.
A bounded exclusion search (32 routing calls maximum, three unique candidates)
supplements it. This is not a k-shortest algorithm, exhaustive general search or
proof of best alternatives. Search-budget exhaustion raises an error; it is not
reported as an established absence of compliant routes.

The fixture requires 3/2/1/0 candidates as its forward corridors are blocked.
It also checks the opposite direction, virtual endpoints, a later unrestricted
request, and 12 interleaved requests on two threads. `adapter.py` independently
checks every returned path's complete directed trace, geometry and metric units.
Incomplete evidence or any forbidden traversal rejects the response. Every
adapted result has `navigation_allowed=False`: no production or legal claim is
made from synthetic proof. No UI Start policy is changed.

The report records runtime, artifact, source and synthetic OSM checksums. Graph
files and raw import logs remain temporary. This is not a performance benchmark.

## Executed local evidence (21 November 2026)

- Official checksum-pinned GH11.1, OpenJDK 21.0.12.1, 512 MiB heap cap.
- Synthetic candidate counts: 3, 2, 1, 0 as exclusions increase.
- Reverse-direction and virtual reverse routes retained; all-forward-blocked
  virtual endpoint query returns no route. Every emitted trace is checked again
  by the independent Python adapter.
- Twelve interleaved restricted/unrestricted requests on two Java threads pass.
- Prototype regression suite: 25 passed, including the actual import/routing run.
- Existing CI backend selection plus pure prototype tests: 2,572 passed,
  two skips, 94 subtests passed. One skip is the intentionally opt-in real-engine
  test, separately executed above; the other is the pre-existing selected-suite skip.
- JavaScript: 198 suites / 3,829 tests passed; test lint passed.

Java 17 is configured in the separate CI job; its result must be checked before
claiming that runtime has been exercised. Heap cap and tiny-fixture timing are
not UK/US capacity measurements. No browser or physical-phone test was performed.

## What remains blocked

Production migration remains **NO-GO**. This experiment does not establish:

- Real camera/signal/crossing association, coverage, freshness or licensing.
- Turn-restriction relation correctness (the fixture has no restriction relation).
- Multi-stop seam legality, stop ordering, reroutes or application cache binding.
- Parallel carriageways, intersection approaches or graph-region boundaries.
- Endpoint access/snap-gap acceptance, instruction/UI parity or physical-phone behavior.
- CH/LM compatibility, UK/US imports, realistic latency or server capacity.

Before any routing rollout: obtain sanitized GH8 deployment facts; add the
missing fixtures; keep mandatory refusal through every UI path; version graph,
hazards, compiler and validator together; and perform measured imports. Any
future service, dataset download, production selection or infrastructure change
requires separate approval. Preserve the GH8 service, JDK, graph and configuration
as a complete rollback bundle. This prototype provides no production switch.
