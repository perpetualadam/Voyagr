#!/usr/bin/env python3
"""Explicit operator refresh only; never enables automatic route pricing."""
import argparse
import json
from pathlib import Path
import sys


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-file', type=Path, help='Optional JSON snapshot path; parent directory must exist. Persistent refresh requires POSIX.')
    parser.add_argument('--force', action='store_true', help='Bypass cadence/backoff for this explicit refresh; never bypasses locking or validation.')
    parser.add_argument('--max-age-days', type=int, default=14, help='Maximum automatically usable observation age (default: 14).')
    args = parser.parse_args(argv)
    repository = str(Path(__file__).resolve().parents[1])
    if repository not in sys.path:
        sys.path.insert(0, repository)
    from voyagr.services.weekly_fuel_prices import WeeklyFuelPriceCache
    try:
        cache = WeeklyFuelPriceCache(args.cache_file, max_age_days=args.max_age_days)
    except ValueError as error:
        parser.error(str(error))
    result = cache.refresh(force=args.force)
    quotes = {category: cache.quote(category) for category in ('petrol', 'diesel')}
    print(json.dumps({'result': result, 'cache': cache.status(), 'quotes': quotes,
                      'route_pricing_changed': False}, sort_keys=True))
    return 1 if result['state'] == 'FAILED' else 0 if all(quotes.values()) else 2


if __name__ == '__main__':
    raise SystemExit(main())
