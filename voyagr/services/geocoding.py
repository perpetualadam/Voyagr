"""
Geocoding helpers: parse address queries, rank Nominatim/TomTom results.

Used by voyagr.api.search geocode proxy so house numbers, postcodes, and
industrial/business addresses resolve to the intended point — not a nearby
street centroid or a homonym in another town.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

# UK unit postcode (outward + inward). Allows optional space/hyphen/dot separator.
# Includes the special-case GIR 0AA.
_UK_POSTCODE_RE = re.compile(
    r'\b(GIR\s*0AA|(?:[A-Z]{1,2}\d[A-Z\d]?)\s*[-\s.]?\d[A-Z]{2})\b',
    re.IGNORECASE,
)

# UK outward code only (district/area), e.g. LS1, SW1A, EC1A, GIR.
_UK_OUTCODE_RE = re.compile(
    r'^(GIR|[A-Z]{1,2}\d[A-Z\d]?)$',
    re.IGNORECASE,
)

# Partial UK postcode while typing (outward + incomplete inward).
_UK_PARTIAL_POSTCODE_RE = re.compile(
    r'^(GIR|[A-Z]{1,2}\d[A-Z\d]?)(?:\s*[-\s.]?(?:\d[A-Z]{0,2})?)?$',
    re.IGNORECASE,
)

# Leading house/unit number: "12", "12A", "Unit 5", "Plot 3", "Warehouse 7"
_LEADING_NUMBER_RE = re.compile(
    r'^(?:\s*(?:unit|flat|suite|plot|building|warehouse|bay|block)\.?\s+)?'
    r'(\d+\s*[a-zA-Z]?)\b',
    re.IGNORECASE,
)

# Trailing house number (less common): "High Street 12"
_TRAILING_NUMBER_RE = re.compile(
    r',\s*(\d+\s*[a-zA-Z]?)\s*$',
    re.IGNORECASE,
)

_BUSINESS_KEYWORDS = (
    'industrial', 'estate', 'business park', 'trading estate', 'units',
    'unit ', 'warehouse', 'factory', 'depot', 'distribution', 'logistics',
    'retail park', 'commerce', 'works', 'mill', 'yard', 'parkway',
)


@dataclass(frozen=True)
class ParsedQuery:
    raw: str
    house_number: str
    street: str
    city: str
    postcode: str  # normalised (no spaces) for matching
    postcode_display: str  # formatted for Nominatim structured search
    is_business: bool
    # '' | 'unit' (full postcode) | 'outward' (district only, e.g. LS1)
    postcode_kind: str = ''


def normalize_house_number(value: str) -> str:
    """Normalize '12 A' / '12a' → '12a' for comparison."""
    s = (value or '').strip().lower().replace(' ', '')
    return s


def format_uk_postcode_display(raw_match: str) -> str:
    """Normalise a matched UK postcode to 'OUTWARD INWARD' display form."""
    display = (raw_match or '').upper().strip()
    display = re.sub(r'[-\s.]+', '', display)
    if display == 'GIR0AA':
        return 'GIR 0AA'
    if len(display) >= 5:
        return display[:-3] + ' ' + display[-3:]
    return display


def extract_uk_postcode(query: str) -> Tuple[str, str, str]:
    """Return (normalised, display, query_with_postcode_removed).

    Prefers a full unit postcode. If the whole query is only an outward code
    (e.g. ``LS1`` / ``SW1A``), treat that as the postcode so callers can bias
    search to the UK and avoid structured ``street=LS1`` lookups.
    """
    m = _UK_POSTCODE_RE.search(query)
    if m:
        display = format_uk_postcode_display(m.group(1))
        normalised = display.replace(' ', '').upper()
        cleaned = (query[: m.start()] + query[m.end() :]).strip(' ,')
        return normalised, display, cleaned

    stripped = (query or '').strip()
    m_out = _UK_OUTCODE_RE.match(stripped)
    if m_out:
        display = m_out.group(1).upper()
        return display, display, ''

    return '', '', query


def looks_like_uk_postcode_query(query: str) -> bool:
    """True when the query is (or clearly contains) a UK postcode / outcode."""
    q = (query or '').strip()
    if not q:
        return False
    if _UK_POSTCODE_RE.search(q):
        return True
    if _UK_OUTCODE_RE.match(q):
        return True
    # Compact full postcode without separators, e.g. sw1a1aa
    compact = re.sub(r'[-\s.]+', '', q)
    if _UK_POSTCODE_RE.fullmatch(compact) or _UK_OUTCODE_RE.match(compact):
        return True
    return False


def looks_like_partial_uk_postcode(query: str) -> bool:
    """True for incomplete UK postcodes typed during autocomplete (SW1A 1A)."""
    q = (query or '').strip()
    if not q:
        return False
    # Full unit / outward codes are handled separately; not "partial".
    if looks_like_uk_postcode_query(q):
        return False
    compact = re.sub(r'\s+', ' ', q)
    return bool(_UK_PARTIAL_POSTCODE_RE.match(compact))


def query_has_house_number(query: str) -> bool:
    q = query.strip()
    # Mid-typed / postcode-only queries must not be treated as house numbers
    # (Nominatim layer=address would filter out postcode results).
    if looks_like_uk_postcode_query(q) or looks_like_partial_uk_postcode(q):
        return False
    if _LEADING_NUMBER_RE.match(q):
        return True
    if _TRAILING_NUMBER_RE.search(q):
        return True
    return False


def is_business_or_industrial_query(query: str) -> bool:
    lower = query.lower()
    return any(kw in lower for kw in _BUSINESS_KEYWORDS)


def parse_address_query(query: str) -> ParsedQuery:
    """Best-effort parse of a free-form UK-style address string."""
    raw = (query or '').strip()
    postcode, postcode_display, remainder = extract_uk_postcode(raw)
    postcode_kind = ''
    if postcode:
        # Outward-only when display has no inward part (no space / short).
        if ' ' in postcode_display:
            postcode_kind = 'unit'
        else:
            postcode_kind = 'outward'

    parts = [p.strip() for p in remainder.split(',') if p.strip()]

    house_number = ''
    street = ''
    city = ''

    # Pure postcode / outcode query: do not invent a street from the code itself.
    if postcode and not parts:
        return ParsedQuery(
            raw=raw,
            house_number='',
            street='',
            city='',
            postcode=postcode,
            postcode_display=postcode_display,
            is_business=False,
            postcode_kind=postcode_kind,
        )

    if parts:
        first = parts[0]
        # Avoid treating trailing digits of a partial postcode remnant as a house number.
        if looks_like_partial_uk_postcode(first) or looks_like_uk_postcode_query(first):
            street = first
        else:
            m_lead = _LEADING_NUMBER_RE.match(first)
            if m_lead:
                house_number = normalize_house_number(m_lead.group(1))
                street = first[m_lead.end() :].strip(' ,')
            else:
                m_trail = re.search(r'\b(\d+\s*[a-zA-Z]?)\s*$', first)
                if m_trail:
                    house_number = normalize_house_number(m_trail.group(1))
                    street = first[: m_trail.start()].strip(' ,')
                else:
                    street = first

        if len(parts) >= 2:
            city = parts[-1] if len(parts) == 2 else ', '.join(parts[1:])

    return ParsedQuery(
        raw=raw,
        house_number=house_number,
        street=street,
        city=city,
        postcode=postcode,
        postcode_display=postcode_display,
        is_business=is_business_or_industrial_query(raw),
        postcode_kind=postcode_kind,
    )


def build_nominatim_structured_params(parsed: ParsedQuery) -> Optional[Dict[str, str]]:
    """Nominatim structured search params when we have street and/or postcode."""
    # Outward-only codes are not valid Nominatim postalcode= values; skip structured.
    if parsed.postcode_kind == 'outward' and not parsed.street:
        return None
    if not parsed.street and not parsed.postcode:
        return None

    params: Dict[str, str] = {
        'format': 'json',
        'addressdetails': '1',
        'limit': '10',
        'dedupe': '1',
    }

    street_line = parsed.street
    if parsed.house_number and street_line:
        street_line = f"{parsed.house_number} {street_line}".strip()
    elif parsed.house_number:
        street_line = parsed.house_number

    if street_line:
        params['street'] = street_line
    if parsed.postcode_display and parsed.postcode_kind != 'outward':
        params['postalcode'] = parsed.postcode_display
    if parsed.city:
        params['city'] = parsed.city

    # Structured search with only an outward code left nothing useful.
    if 'street' not in params and 'postalcode' not in params:
        return None

    return params


def _token_set(text: str) -> set:
    return {t for t in re.split(r'[\s,]+', (text or '').lower()) if len(t) > 2}


def _postcode_matches(parsed: ParsedQuery, addr: Dict[str, Any]) -> bool:
    if not parsed.postcode:
        return False
    for key in ('postcode', 'postal_code'):
        val = (addr.get(key) or '').replace(' ', '').upper()
        if not val:
            continue
        if val == parsed.postcode:
            return True
        # Outward-only query: accept any result in that district.
        if parsed.postcode_kind == 'outward' and val.startswith(parsed.postcode):
            return True
    return False


def _road_matches(parsed: ParsedQuery, addr: Dict[str, Any], display_name: str) -> bool:
    if not parsed.street:
        return False
    road = (addr.get('road') or addr.get('street') or addr.get('pedestrian') or '').lower()
    street_tokens = _token_set(parsed.street)
    if not street_tokens:
        return False
    road_tokens = _token_set(road)
    if street_tokens & road_tokens:
        return True
    display_tokens = _token_set(display_name)
    return len(street_tokens & display_tokens) >= max(1, len(street_tokens) // 2)


def score_geocode_result(parsed: ParsedQuery, result: Dict[str, Any]) -> float:
    """Higher score = better match for the user's query."""
    score = 0.0
    addr = result.get('address') or {}
    display = (result.get('display_name') or result.get('name') or '')
    rtype = (result.get('type') or '').lower()
    rclass = (result.get('class') or '').lower()

    result_hn = normalize_house_number(addr.get('house_number') or '')
    if parsed.house_number:
        if result_hn == parsed.house_number:
            score += 120.0
        elif result_hn:
            score -= 60.0
        elif rtype in ('street', 'road', 'residential', 'unclassified'):
            score -= 35.0
        elif rtype in ('city', 'town', 'village', 'administrative', 'suburb'):
            score -= 50.0
        elif rtype in ('house', 'building', 'address', 'yes'):
            score += 5.0

    if _postcode_matches(parsed, addr):
        score += 80.0
    elif parsed.postcode and parsed.postcode[:3] in display.replace(' ', '').upper():
        score += 25.0

    # Prefer dedicated postcode hits (Nominatim type=postcode / postcodes.io).
    if parsed.postcode and rtype == 'postcode':
        score += 50.0
    if result.get('_source') == 'postcodes_io' and parsed.postcode:
        score += 40.0

    # Prefer GB results when the query looks like a UK postcode.
    country_code = (addr.get('country_code') or '').lower()
    if parsed.postcode:
        if country_code == 'gb':
            score += 35.0
        elif country_code and country_code != 'gb':
            score -= 40.0

    if _road_matches(parsed, addr, display):
        score += 40.0

    if parsed.city:
        city_lower = parsed.city.lower()
        city_hit = False
        for key in ('city', 'town', 'village', 'municipality', 'suburb'):
            val = (addr.get(key) or '').lower()
            if val and (city_lower == val or city_lower in val or val in city_lower):
                score += 45.0
                city_hit = True
                break
        if city_lower in display.lower():
            score += 25.0 if city_hit else 15.0
        elif not city_hit and city_lower not in display.lower():
            score -= 30.0

    if parsed.is_business:
        if rclass in ('office', 'industrial', 'building', 'amenity', 'shop', 'landuse'):
            score += 20.0
        if rtype in ('industrial', 'commercial', 'company', 'warehouse', 'works'):
            score += 25.0
        if rclass == 'place' and rtype in ('industrial', 'commercial'):
            score += 30.0

    importance = result.get('importance')
    if importance is not None:
        try:
            score += float(importance) * 15.0
        except (TypeError, ValueError):
            pass

    if parsed.house_number and rtype in ('house', 'building', 'residential', 'address'):
        score += 12.0

    if result.get('_source') == 'tomtom' and parsed.house_number and result_hn == parsed.house_number:
        score += 8.0

    return score


def dedupe_results(results: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set = set()
    out: List[Dict[str, Any]] = []
    for r in results:
        try:
            key = (round(float(r.get('lat', 0)), 4), round(float(r.get('lon', 0)), 4))
        except (TypeError, ValueError):
            continue
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def rank_geocode_results(query: str, results: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    parsed = parse_address_query(query)
    if not results:
        return []
    scored = [(score_geocode_result(parsed, r), r) for r in results]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [r for _, r in scored]


def should_fetch_tomtom(query: str, nominatim_results: Sequence[Dict[str, Any]]) -> bool:
    """Whether to query TomTom and merge (requires TOMTOM_API_KEY on server)."""
    parsed = parse_address_query(query)
    if not nominatim_results:
        return True

    ranked = rank_geocode_results(query, nominatim_results)
    if not ranked:
        return True

    top_score = score_geocode_result(parsed, ranked[0])

    if parsed.house_number:
        return top_score < 80.0
    if parsed.is_business:
        return top_score < 50.0
    if parsed.postcode:
        return top_score < 60.0
    return top_score < 25.0


def nominatim_extra_params_for_query(query: str) -> Dict[str, str]:
    """Optional Nominatim query params to tighten free-text search."""
    parsed = parse_address_query(query)
    extra: Dict[str, str] = {'dedupe': '1'}
    # House-number layer filter must not apply to postcode / partial postcode queries.
    if parsed.house_number and not parsed.postcode and not looks_like_partial_uk_postcode(query):
        extra['layer'] = 'address'
    if looks_like_uk_postcode_query(query) or looks_like_partial_uk_postcode(query):
        # Bias free-text Nominatim toward UK when the query is postcode-like.
        extra['countrycodes'] = 'gb'
    return extra
