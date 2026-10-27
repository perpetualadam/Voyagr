# Phase 6 — legal speed provenance

Date: 2026-10-27. Baseline: `7c4bc9d92a7a376c748d8e65049a6c52ed82a38a` (latest fetched main; Phase 5 PR #341 merged). Branch: `codex/phase6-uk-navigation-accuracy`. **PHASE6_PARTIALLY_VERIFIED; production NO-GO.** No deployment, production access/data/configuration change or paid provider call.

## Root cause and changes

The candidate lookup mixed TomTom/nearest OSM/cache/road-class defaults with legal-limit presentation. Its positional cache omitted heading/road context, and speed-warning endpoints invented defaults. `legal_speed_evidence` now requires fresh (≤300 s) trusted matched road/direction, vehicle and one of England, Scotland, Wales or Northern Ireland. Supported numeric mapped limits use MAPPED_POSTED/applicable=true. Bare OSM numeric values are km/h; explicit mph remains mph. Direction-specific values take precedence. One-way conflicts, stale/unknown context and unsupported vehicles produce no legal numeric value.

MAPPED_CONDITIONAL records unresolved conditional restrictions, CONFLICTING records uninterpreted vehicle/advisory/variable or invalid values, LEGAL_RULE_INFERRED records symbolic national-rule candidates, UNKNOWN records absent applicability. None of these states supplies a verified legal number. National defaults are not guessed across jurisdictions/vehicles/carriageways; HGV/towing and complex rules need a reviewed legal implementation.

`speed_limit_detector.py` retains old lookup values only as `estimated_speed_mph` candidates when not applicable; candidate cache keys add road class/region/heading bucket/provider hint. Canonical legal evaluation occurs separately, including actual requested vehicle, rather than trusting cached candidate identity. The browser widget accepts applicable MAPPED_POSTED evidence only, otherwise clears the legal-limit display/warnings instead of reviving an offline edge/default. Current GPS speed display remains. Public speed warnings report unknown rather than road-class law; missing coordinates fail validation. Explicit speed-violation inputs retain strict `>` threshold semantics and now reject nonfinite/negative values.

## Verification and operational limitation

Tests cover all four UK jurisdictions with supplied matched context, directional preference, missing jurisdiction/vehicle/road match, freshness, conditional/symbolic evidence, bare km/h, explicit mph, strict threshold and nonfinite inputs. Revised legacy candidate tests still assert the original numeric candidate and additionally prohibit legal applicability.

Current remote acquisition does not establish trusted road context: normal `/speed-limit` responses are unknown legally, with candidates separately labelled. This is safer presentation, not verified live posted-limit accuracy. No real signs, remote speed provider, UK rule catalogue, temporary limit feed or installed graph was validated. Do not enable automatic legal speed warnings from a nearby way, bare route edge or estimate without the missing applicability integration and acceptance tests.
