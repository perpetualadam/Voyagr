"""
Canonical voice-hazard documentation contract.

User-facing voice guides must not claim end-to-end hazard reporting for
phrases that the parser does not recognize or that /api/hazards/report
rejects. Tests import these constants to keep docs honest.
"""

from __future__ import annotations

# Phrases docs may present as fully working (parse + community allowlist save).
DOCUMENTED_END_TO_END_VOICE_HAZARD_PHRASES = (
    ('report accident', 'accident'),
    ('report crash', 'accident'),
)

# Recognized by _parse_voice_command today, but hazard_type is not in
# ALLOWED_COMMUNITY_HAZARD_TYPES so the report API rejects them.
DOCUMENTED_PARSED_BUT_NOT_SAVED_VOICE_HAZARD_PHRASES = (
    ('report speed camera', 'speed_camera'),
    ('report traffic light camera', 'camera_red_light'),
    ('report road closure', 'road_closure'),
    ('report traffic jam', 'traffic'),
    ('report pothole', 'pothole'),
)

# Listed historically in guides but not recognized by the web parser.
DOCUMENTED_UNSUPPORTED_VOICE_HAZARD_PHRASES = (
    'Report police',
    'Report debris',
)

# Primary user/product docs that must follow the hazard-reporting status wording.
PRIMARY_VOICE_HAZARD_DOC_PATHS = (
    'PWA_VOICE_QUICK_START.md',
    'PWA_VOICE_COMPLETE_GUIDE.md',
    'PWA_VOICE_INDEX.md',
    'PWA_VOICE_FEATURES_IMPLEMENTATION.md',
    'VOICE_FEATURES_COMPLETE.md',
)

# Required status headings in those primary docs.
VOICE_HAZARD_DOC_WORKING_HEADING = 'Works end-to-end today'
VOICE_HAZARD_DOC_PARSED_NOT_SAVED_HEADING = 'Recognized by voice but not yet saved'
VOICE_HAZARD_DOC_UNSUPPORTED_HEADING = 'Not yet recognized'
