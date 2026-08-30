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

# Royal Mail single-letter postcode areas (outward only); e.g. B1, M1, W1 — not A1 (A road).
_VALID_SINGLE_LETTER_POSTCODE_AREAS = frozenset('BEGLMNSW')

# Outward codes that are valid postcodes but are more often UK motorway designations in search.
_MOTORWAY_AMBIGUOUS_OUTCODES = frozenset({
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M11', 'M18', 'M20', 'M23', 'M25', 'M26', 'M27',
    'M32', 'M40', 'M42', 'M45', 'M50', 'M53', 'M56', 'M60', 'M62', 'M65', 'M66', 'M67',
    'M69', 'M73', 'M74', 'M77', 'M80', 'M90',
})

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

# Named businesses / POIs (word-boundary matched where short/ambiguous).
_BUSINESS_NAME_HINTS = (
    'ltd', 'limited', 'plc', 'inc', 'llc', 'cafe', 'café', 'restaurant',
    'hotel', 'inn', 'supermarket', 'pharmacy', 'garage', 'takeaway', 'bakery',
    'salon', 'clinic', 'dentist', 'veterinary', 'vets', 'gym', 'cinema',
    'theatre', 'theater', 'museum', 'gallery', 'pub', 'bistro', 'coffee',
    'store', 'stores', 'shop', 'market', 'centre', 'center', 'station',
    # Brands / formats that often omit a category word (e.g. "Tesco Express").
    # Ambiguous tokens like "express" are ignored when the subject looks like
    # a road name (see is_business_or_industrial_query).
    'express', 'tesco', 'sainsbury', 'asda', 'morrisons', 'aldi', 'lidl',
    'waitrose', 'ikea', 'argos', 'boots',
)

_ROAD_SUFFIX_RE = re.compile(
    r'\b(?:street|st|road|rd|lane|ln|avenue|ave|drive|dr|close|crescent|'
    r'way|court|ct|place|pl|terrace|gardens|grove|hill|row|parade|'
    r'boulevard|blvd|mews|walk|gate|square|sq)\b',
    re.IGNORECASE,
)

_POI_CLASSES = frozenset({
    'amenity', 'shop', 'office', 'tourism', 'craft', 'leisure', 'healthcare',
    'industrial', 'building', 'landuse',
})

_POI_TYPES = frozenset({
    'poi', 'company', 'commercial', 'industrial', 'warehouse', 'works',
    'supermarket', 'convenience', 'restaurant', 'cafe', 'fast_food',
    'fuel', 'hotel', 'motel', 'pub', 'bar', 'pharmacy', 'clinic',
})


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


def _is_plausible_uk_outward_code(code: str) -> bool:
    """False for A-road style tokens (A1) and other non-Royal-Mail outward codes."""
    c = (code or '').upper().strip()
    if c == 'GIR':
        return True
    m = re.match(r'^([A-Z]{1,2})(\d)([A-Z\d]?)$', c)
    if not m:
        return False
    letters = m.group(1)
    if len(letters) == 1:
        return letters in _VALID_SINGLE_LETTER_POSTCODE_AREAS
    return True


def _is_motorway_ambiguous_outcode(code: str) -> bool:
    """Outward codes that collide with famous motorway names (M1, M25, …)."""
    return (code or '').upper().strip() in _MOTORWAY_AMBIGUOUS_OUTCODES


def _accept_outward_only_postcode(code: str) -> bool:
    """Whether a whole-query outward token should be treated as a UK postcode."""
    c = (code or '').upper().strip()
    if not _is_plausible_uk_outward_code(c):
        return False
    if _is_motorway_ambiguous_outcode(c):
        return False
    return True


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
        if _accept_outward_only_postcode(display):
            return display, display, ''

    return '', '', query


def looks_like_uk_postcode_query(query: str) -> bool:
    """True when the query is (or clearly contains) a UK postcode / outcode."""
    q = (query or '').strip()
    if not q:
        return False
    if _UK_POSTCODE_RE.search(q):
        return True
    m_out = _UK_OUTCODE_RE.match(q)
    if m_out and _accept_outward_only_postcode(m_out.group(1)):
        return True
    # Compact full postcode without separators, e.g. sw1a1aa
    compact = re.sub(r'[-\s.]+', '', q)
    if _UK_POSTCODE_RE.fullmatch(compact):
        return True
    m_compact = _UK_OUTCODE_RE.match(compact)
    if m_compact and _accept_outward_only_postcode(m_compact.group(1)):
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


def looks_like_road_name(street: str) -> bool:
    """True when a street token looks like a road rather than a business name."""
    s = (street or '').strip()
    if not s:
        return False
    return bool(_ROAD_SUFFIX_RE.search(s))


def _hint_is_only_road_name_component(hint: str, lower_query: str) -> bool:
    """True when every hit of hint is part of a road name (e.g. Express Way).

    Format/category hints like express/station/market are common UK street
    tokens; treating them as businesses forces the TomTom POI path and can
    rank a store above the road (including city-first queries such as
    "Leeds, Express Way" where the road is not the first comma segment).
    """
    matches = list(re.finditer(rf'\b{re.escape(hint)}\b', lower_query, re.IGNORECASE))
    if not matches:
        return False
    for m in matches:
        after = lower_query[m.end() :]
        # "Express Way", "New Market Street" (optional single intervening word)
        if not re.match(
            rf'(?:\s+\w+){{0,1}}\s+(?:street|st|road|rd|lane|ln|avenue|ave|'
            rf'drive|dr|close|crescent|way|court|ct|place|pl|terrace|'
            rf'gardens|grove|hill|row|parade|boulevard|blvd|mews|walk|'
            rf'gate|square|sq)\b',
            after,
            re.IGNORECASE,
        ):
            return False
    return True


def is_business_or_industrial_query(query: str) -> bool:
    """True for industrial estates and common named-business / POI phrasing."""
    lower = (query or '').lower()
    if any(kw in lower for kw in _BUSINESS_KEYWORDS):
        return True
    # First comma segment is the subject (POI name or street). Road-suffix
    # subjects are streets, not businesses — even when they contain format
    # words from _BUSINESS_NAME_HINTS (e.g. "Express Way", "Station Road").
    subject = lower.split(',')[0].strip()
    if looks_like_road_name(subject):
        return False
    for hint in _BUSINESS_NAME_HINTS:
        if not re.search(rf'\b{re.escape(hint)}\b', lower, re.IGNORECASE):
            continue
        # Skip hints that only appear as road-name components elsewhere in the
        # query (city-first: "Leeds, Express Way").
        if _hint_is_only_road_name_component(hint, lower):
            continue
        return True
    return False


def result_looks_like_poi(result: Dict[str, Any]) -> bool:
    """Whether a geocode hit is a business/POI rather than a street centroid."""
    rclass = (result.get('class') or '').lower()
    rtype = (result.get('type') or '').lower()
    if rclass in _POI_CLASSES:
        return True
    if rtype in _POI_TYPES:
        return True
    return False


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

    # Named places ("Tesco Express, Leeds") are free-text / TomTom searches;
    # Nominatim street= expects a road name and returns poor or empty hits.
    street_for_structured = parsed.street
    if (
        street_for_structured
        and not parsed.house_number
        and not looks_like_road_name(street_for_structured)
    ):
        street_for_structured = ''
        if not parsed.postcode:
            return None

    params: Dict[str, str] = {
        'format': 'json',
        'addressdetails': '1',
        'namedetails': '1',
        'limit': '10',
        'dedupe': '1',
    }

    street_line = street_for_structured
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


def _normalised_outward_code(postcode: str) -> str:
    """Extract the outward district from a normalised UK postcode (no spaces)."""
    val = (postcode or '').replace(' ', '').upper()
    if not val:
        return ''
    if val == 'GIR0AA':
        return 'GIR'
    m = re.match(r'^(?:GIR0AA|([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2}))$', val)
    if m:
        return m.group(1)
    if _UK_OUTCODE_RE.match(val):
        return val
    return ''


def _postcode_matches(parsed: ParsedQuery, addr: Dict[str, Any]) -> bool:
    if not parsed.postcode:
        return False
    for key in ('postcode', 'postal_code'):
        val = (addr.get(key) or '').replace(' ', '').upper()
        if not val:
            continue
        if val == parsed.postcode:
            return True
        # Outward-only query: match the district exactly (LS1 ≠ LS10).
        if parsed.postcode_kind == 'outward':
            if _normalised_outward_code(val) == parsed.postcode:
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
    # Road-suffix queries must match the structured road field. Display-name
    # fallback is too loose ("Express Way" must not match "Tesco Express, …").
    if looks_like_road_name(parsed.street):
        return False
    display_tokens = _token_set(display_name)
    return len(street_tokens & display_tokens) >= max(1, len(street_tokens) // 2)


def _poi_name_overlap(parsed: ParsedQuery, result: Dict[str, Any]) -> int:
    """Count meaningful query tokens that appear in the POI/business name."""
    name = (result.get('name') or '').strip()
    namedetails = result.get('namedetails') or {}
    if isinstance(namedetails, dict):
        name = name or (namedetails.get('name') or '')
    display = (result.get('display_name') or '')
    first_part = display.split(',')[0] if display else ''
    name_tokens = _token_set(name) | _token_set(first_part)
    if not name_tokens:
        return 0

    # Compare against the non-postcode remainder so SW1A etc. do not inflate overlap.
    query_basis = parsed.street or parsed.raw
    if parsed.city:
        query_basis = f"{query_basis} {parsed.city}".strip()
    query_tokens = _token_set(query_basis)
    if not query_tokens:
        query_tokens = _token_set(parsed.raw)
    return len(query_tokens & name_tokens)


def score_geocode_result(parsed: ParsedQuery, result: Dict[str, Any]) -> float:
    """Higher score = better match for the user's query."""
    score = 0.0
    addr = result.get('address') or {}
    display = (result.get('display_name') or result.get('name') or '')
    rtype = (result.get('type') or '').lower()
    rclass = (result.get('class') or '').lower()
    is_poi = result_looks_like_poi(result)

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
    elif parsed.postcode:
        display_compact = display.replace(' ', '').upper()
        if parsed.postcode_kind == 'outward':
            if _normalised_outward_code(display_compact) == parsed.postcode:
                score += 25.0
        elif parsed.postcode[:3] in display_compact:
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
        if rtype in ('industrial', 'commercial', 'company', 'warehouse', 'works', 'poi'):
            score += 25.0
        if rclass == 'place' and rtype in ('industrial', 'commercial'):
            score += 30.0
        if is_poi:
            score += 15.0

    # Prefer POIs whose name overlaps the query (Tesco, Costa Coffee, …).
    overlap = _poi_name_overlap(parsed, result)
    if is_poi and overlap:
        score += min(55.0, 25.0 + overlap * 15.0)
    elif overlap >= 2 and not parsed.house_number:
        # Free-text business names without industrial keywords still boost named hits.
        score += min(40.0, overlap * 12.0)

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
    if result.get('_source') == 'tomtom' and is_poi and overlap:
        score += 10.0

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
    top = ranked[0]

    if parsed.house_number:
        return top_score < 80.0
    # Road-suffix streets must not take the business TomTom/POI path just
    # because a hint token appears in the road name (e.g. "Express Way").
    if parsed.is_business and not looks_like_road_name(parsed.street or ''):
        # TomTom Fuzzy Search is strong for named businesses; merge unless we
        # already have a well-scoring POI hit.
        if not result_looks_like_poi(top):
            return True
        return top_score < 55.0
    if parsed.postcode:
        return top_score < 60.0
    # Free-text that is not a clear place/road often benefits from POI search.
    # Do not gate on top_score: a single shared road token already scores +40,
    # and a city match adds +45–+70, which blocked TomTom for names like
    # "Tesco Express" when Nominatim only returned a street (e.g. Express Way).
    # Also treat city-first road queries ("Leeds, Express Way") as roads even
    # when parse_address_query puts the city in the street field.
    if (
        not parsed.house_number
        and not looks_like_road_name(parsed.street or query)
        and not looks_like_road_name(query)
    ):
        if not result_looks_like_poi(top):
            return True
    return top_score < 25.0


def nominatim_extra_params_for_query(query: str) -> Dict[str, str]:
    """Optional Nominatim query params to tighten free-text search."""
    parsed = parse_address_query(query)
    extra: Dict[str, str] = {
        'dedupe': '1',
        'namedetails': '1',
    }
    # House-number layer filter must not apply to postcode / partial postcode
    # queries, and must not hide amenity/shop POIs for business name searches.
    if (
        parsed.house_number
        and not parsed.postcode
        and not parsed.is_business
        and not looks_like_partial_uk_postcode(query)
    ):
        extra['layer'] = 'address'
    if looks_like_uk_postcode_query(query) or looks_like_partial_uk_postcode(query):
        # Bias free-text Nominatim toward UK when the query is postcode-like.
        extra['countrycodes'] = 'gb'
    return extra
