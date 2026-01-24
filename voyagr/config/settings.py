"""
Application settings and environment configuration.
"""

import os
from typing import List
from dotenv import load_dotenv

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
VALID_API_KEYS = set(os.getenv('API_KEYS', 'voyagr-default-key').split(','))


def _get_allowed_origins() -> List[str]:
    """Get list of allowed CORS origins from config and environment."""
    origins: List[str] = [
        "http://localhost:5000",
        "http://localhost:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:3000",
    ]

    # Add Railway.app and other production domains
    if os.getenv('RAILWAY_ENVIRONMENT_NAME'):
        railway_url = os.getenv('RAILWAY_PUBLIC_DOMAIN')
        if railway_url:
            origins.append(f"https://{railway_url}")
            origins.append(f"http://{railway_url}")

    # Add environment-configured origins
    env_origins = os.getenv('ALLOWED_ORIGINS', '').strip()
    if env_origins:
        origins.extend([origin.strip() for origin in env_origins.split(',') if origin.strip()])

    return origins


ALLOWED_ORIGINS: List[str] = _get_allowed_origins()

