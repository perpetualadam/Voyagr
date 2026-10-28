"""Bounded /info observations; advertised attributes are not avoidance guarantees."""
import copy
import hashlib
import json
import threading
import time
from urllib.parse import urlparse

import requests
from voyagr.utils.request_budget import current_budget

TTL_SECONDS = 300
FAILURE_TTL_SECONDS = 15
MAX_INFO_BYTES = 65536
_lock = threading.RLock()
_cache = {}
NAMES = frozenset({'toll', 'road_class', 'road_environment', 'max_speed', 'lanes'})


def _read_info(base_url):
    parsed = urlparse(base_url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError('Invalid provider origin')
    budget = current_budget()
    if budget:
        budget.check()
        budget.calls += 1
    started = time.monotonic()
    remaining = min(3, budget.remaining()) if budget else 3
    try:
        with requests.Session() as session:
            with session.get(base_url + '/info', timeout=(min(1, remaining), min(2, remaining)),
                             allow_redirects=False, stream=True) as response:
                if response.status_code != 200:
                    raise ValueError('Metadata HTTP failure')
                raw = bytearray()
                # Yield each byte so a trickling body cannot defer the elapsed-time check
                # until a large application chunk fills. Socket/header timeouts remain idle limits.
                for chunk in response.iter_content(1):
                    if time.monotonic() - started > remaining or len(raw) + len(chunk) > MAX_INFO_BYTES:
                        raise ValueError('Metadata limit exceeded')
                    raw.extend(chunk)
                return json.loads(raw)
    finally:
        if budget:
            budget.transport_seconds += time.monotonic() - started
            budget.check()


def normalise_info(data, profile='car'):
    if not isinstance(data, dict) or not isinstance(data.get('version'), str) or not data['version'] or len(data['version']) > 64:
        raise ValueError('Invalid metadata version')
    profiles = data.get('profiles')
    values = data.get('encoded_values')
    if not isinstance(profiles, list) or len(profiles) > 64 or not isinstance(values, dict) or len(values) > 1000:
        raise ValueError('Unverified metadata schema')
    advertised = {}
    for name in NAMES & values.keys():
        domain = values[name]
        if not isinstance(domain, list) or len(domain) > 128 or any(not isinstance(v, str) or len(v) > 64 for v in domain):
            raise ValueError('Invalid encoded-value declaration')
        advertised[name] = list(domain)
    return {'state': 'verified', 'profile_available': any(isinstance(p, dict) and p.get('name') == profile for p in profiles),
            'encoded_values': advertised,
            'fingerprint': hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:24],
            'checked_at': time.time()}


def get_graphhopper_capabilities(base_url, profile='car'):
    key = (base_url.rstrip('/'), profile)
    # One short bounded fetch per provider/profile; concurrent requests share it.
    with _lock:
        now = time.monotonic()
        cached = _cache.get(key)
        if cached and now < cached[0]:
            return copy.deepcopy(cached[1])
        try:
            result = normalise_info(_read_info(key[0]), profile)
            ttl = TTL_SECONDS
        except Exception:
            # No raw endpoint, exception, credentials or response fields in logs/API.
            result = {'state': 'unavailable', 'profile_available': False, 'encoded_values': {}, 'checked_at': time.time()}
            ttl = FAILURE_TTL_SECONDS
        if len(_cache) >= 8 and key not in _cache:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (time.monotonic() + ttl, result)
        return copy.deepcopy(result)


def invalidate_graphhopper_capabilities(base_url, profile='car'):
    with _lock:
        _cache.pop((base_url.rstrip('/'), profile), None)


def public_capabilities(capabilities):
    result = {key: capabilities[key] for key in ('state', 'profile_available', 'checked_at', 'fingerprint') if key in capabilities}
    result['enforcement_verified'] = False
    result['valid_until'] = capabilities.get('checked_at', 0) + (TTL_SECONDS if capabilities.get('state') == 'verified' else FAILURE_TTL_SECONDS)
    return result
