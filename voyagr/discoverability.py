"""
Discoverability controls: reduce casual search-engine indexing while keeping the PWA open (no login wall).

Set VOYAGR_BLOCK_SEARCH_INDEXING=true in production when you want robots/noindex headers.
This is not a substitute for authentication — share the URL only with people you trust.
"""

import os
import re
from typing import FrozenSet, Tuple

# Search / social crawlers that render JS but do not persist localStorage.
# First-run interstitials then cover the page on every visit, which Google
# reports as "Crawled — currently not indexed" or Soft 404.
#
# Shared with the homepage as a JSON token list (not a regex). Python `re`
# and JavaScript RegExp do not treat escapes like `\b` the same after JSON
# transport (`\b` is a word boundary in regex and a backspace in JSON).
SEARCH_CRAWLER_UA_TOKENS: Tuple[str, ...] = (
    "googlebot",
    "google-inspectiontool",
    "storebot-google",
    "adsbot-google",
    "bingbot",
    "bingpreview",
    "slurp",
    "duckduckbot",
    "baiduspider",
    "yandexbot",
    "yandeximages",
    "applebot",
    "facebookexternalhit",
    "twitterbot",
    "linkedinbot",
)

# Short tokens that appear inside ordinary words (e.g. "slurpee").
SEARCH_CRAWLER_UA_WORD_TOKENS: FrozenSet[str] = frozenset({"slurp"})

_WORD_TOKEN_RE = {
    token: re.compile(rf"(?<![0-9a-z]){re.escape(token)}(?![0-9a-z])")
    for token in SEARCH_CRAWLER_UA_WORD_TOKENS
}


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
    lower = user_agent.lower()
    for token in SEARCH_CRAWLER_UA_TOKENS:
        if token in SEARCH_CRAWLER_UA_WORD_TOKENS:
            if _WORD_TOKEN_RE[token].search(lower):
                return True
        elif token in lower:
            return True
    return False
