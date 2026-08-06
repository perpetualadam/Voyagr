"""
Canonical voice-hazard documentation contract.

User-facing voice guides must not claim end-to-end hazard reporting for
phrases that the parser does not recognize or that /api/hazards/report
rejects. Tests import these constants to keep docs honest.
"""

from __future__ import annotations

# Phrases docs may present as fully working (parse + community allowlist save).
# Types must match classify_voice_hazard_report / ALLOWED_COMMUNITY_HAZARD_TYPES.
DOCUMENTED_END_TO_END_VOICE_HAZARD_PHRASES = (
    ('report accident', 'accident'),
    ('report crash', 'accident'),
    ('report speed camera', 'speed_camera'),
    ('report traffic light camera', 'camera_red_light'),
    ('report road closure', 'closure'),
    ('report traffic jam', 'congestion'),
    ('report pothole', 'pothole'),
    ('report police', 'police'),
    ('report debris', 'debris'),
)

# Recognized by voice but rejected by /api/hazards/report — none currently.
DOCUMENTED_PARSED_BUT_NOT_SAVED_VOICE_HAZARD_PHRASES = ()

# Listed historically but not recognized — none currently.
DOCUMENTED_UNSUPPORTED_VOICE_HAZARD_PHRASES = ()

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
