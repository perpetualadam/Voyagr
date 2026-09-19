"""
Discoverability controls: reduce casual search-engine indexing while keeping the PWA open (no login wall).

Set VOYAGR_BLOCK_SEARCH_INDEXING=true in production when you want robots/noindex headers.
This is not a substitute for authentication — share the URL only with people you trust.
"""

import os
import re

# Search / social crawlers that render JS but do not persist localStorage.
# First-run interstitials then cover the page on every visit, which Google
# reports as "Crawled — currently not indexed" or Soft 404.
# Shared with the homepage JS (navigator.userAgent) so HTML does not vary by UA.
SEARCH_CRAWLER_UA_PATTERN = (
    r"(?:googlebot|google-inspectiontool|storebot-google|adsbot-google|"
    r"bingbot|bingpreview|\bslurp\b|duckduckbot|baiduspider|yandex(?:bot|images)|"
    r"applebot|facebookexternalhit|twitterbot|linkedinbot)"
)
_SEARCH_CRAWLER_RE = re.compile(SEARCH_CRAWLER_UA_PATTERN, re.IGNORECASE)


def block_search_indexing() -> bool:
    return os.getenv('VOYAGR_BLOCK_SEARCH_INDEXING', '').strip().lower() in (
        '1',
        'true',
        'yes',
        'on',
    )


def is_search_crawler(user_agent: str = "") -> bool:
    """True when the User-Agent is a well-known search or link-preview crawler."""
    if not user_agent:
        return False
    return _SEARCH_CRAWLER_RE.search(user_agent) is not None
