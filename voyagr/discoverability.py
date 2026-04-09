"""
Discoverability controls: reduce casual search-engine indexing while keeping the PWA open (no login wall).

Set VOYAGR_BLOCK_SEARCH_INDEXING=true in production when you want robots/noindex headers.
This is not a substitute for authentication — share the URL only with people you trust.
"""

import os


def block_search_indexing() -> bool:
    return os.getenv('VOYAGR_BLOCK_SEARCH_INDEXING', '').strip().lower() in (
        '1',
        'true',
        'yes',
        'on',
    )
