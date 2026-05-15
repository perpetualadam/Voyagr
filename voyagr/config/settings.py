"""
Application settings and environment configuration.
"""

import logging
import os
from typing import List
from dotenv import load_dotenv

_log = logging.getLogger(__name__)

# Load .env from the project root
_script_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_env_path = os.path.join(_script_dir, '.env')
load_dotenv(_env_path)

# ============================================================================
# ROUTING ENGINE URLS
# ============================================================================
VALHALLA_URL = os.getenv('VALHALLA_URL', 'http://localhost:8002')
GRAPHHOPPER_URL = os.getenv('GRAPHHOPPER_URL', 'http://localhost:8989')
OSRM_URL = os.getenv('OSRM_URL', 'http://router.project-osrm.org/route/v1')
USE_OSRM = os.getenv('USE_OSRM', 'false').lower() == 'true'

# ============================================================================
# GRAPHHOPPER CAMERA AVOIDANCE CONFIGURATION
# ============================================================================
USE_GRAPHHOPPER_CAMERA_AVOIDANCE = os.getenv('USE_GRAPHHOPPER_CAMERA_AVOIDANCE', 'true').lower() == 'true'
GRAPHHOPPER_CAMERA_AREAS_COUNT = int(os.getenv('GRAPHHOPPER_CAMERA_AREAS_COUNT', '137'))
GRAPHHOPPER_TIMEOUT = int(os.getenv('GRAPHHOPPER_TIMEOUT', '30'))

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DB_FILE = 'voyagr_web.db'

# ============================================================================
# AUTHENTICATION
# ============================================================================
_api_keys_raw = os.getenv('API_KEYS')
if _api_keys_raw is None or not str(_api_keys_raw).strip():
    VALID_API_KEYS = {'voyagr-default-key'}
    _log.warning(
        '[SECURITY] API_KEYS is not set - using built-in development default only. '
        'Set API_KEYS (comma-separated) on any Internet-exposed deployment.'
    )
else:
    VALID_API_KEYS = {k.strip() for k in str(_api_keys_raw).split(',') if k.strip()}


def _get_allowed_origins() -> List[str]:
    """Get list of allowed CORS origins from config and environment."""
    origins: List[str] = [
        "http://localhost:5000",
        "http://localhost:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:3000",
    ]

    # Add environment-configured origins (production domains, etc.)
    env_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
    if env_origins:
        origins.extend([origin.strip() for origin in env_origins.split(',') if origin.strip()])

    public_origin = (os.getenv('VOYAGR_PUBLIC_ORIGIN') or '').strip().rstrip('/')
    if public_origin:
        origins.append(public_origin)

    seen = set()
    out: List[str] = []
    for o in origins:
        if o not in seen:
            seen.add(o)
            out.append(o)
    return out


ALLOWED_ORIGINS: List[str] = _get_allowed_origins()

