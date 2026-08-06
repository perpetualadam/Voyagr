"""
Shared voice hazard-report classification for PWA and desktop SatNav.

PWA uses require_report_keyword=True ("report speed camera").
Desktop free-form fallback uses require_report_keyword=False ("pothole ahead"),
then submits via community_hazard_reports (same structured path as the PWA).
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple

# Aliases → canonical community hazard types
VOICE_HAZARD_TYPE_ALIASES = {
    'road_closure': 'closure',
    'traffic': 'congestion',
    'traffic_light_camera': 'camera_red_light',
    'incident': 'closure',
    'camera': 'speed_camera',
    'toll': 'other',
}

# Types accepted by desktop submit_hazard_report / aligned with community reports
DESKTOP_COMMUNITY_HAZARD_TYPES = frozenset({
    'accident', 'roadwork', 'police', 'hazard', 'congestion', 'weather', 'closure',
    'debris', 'flooded', 'animal', 'speed_limit_correction', 'other',
    'pothole', 'speed_camera', 'camera_red_light',
})

# PWA "report …" phrases (order matters: specific cameras before broader matches)
_PWA_VOICE_HAZARD_RULES: Sequence[Tuple[Tuple[str, ...], str, str]] = (
    (
        ('speed camera', 'speeding camera', 'gatso', 'mobile camera'),
        'speed_camera',
        'Logging a speed camera report at your current location.',
    ),
    (
        ('traffic light camera', 'red light camera'),
        'camera_red_light',
        'Logging a traffic light camera report.',
    ),
    (
        ('road closed', 'road closure', 'closure'),
        'closure',
        'Logging a road closure report.',
    ),
    (
        ('pothole',),
        'pothole',
        'Logging a pothole report.',
    ),
    (
        ('accident', 'crash'),
        'accident',
        'Logging an accident report.',
    ),
)

# Desktop free-form extras (no "report" keyword required)
_DESKTOP_EXTRA_HAZARD_RULES: Sequence[Tuple[Tuple[str, ...], str, str]] = (
    (
        ('debris',),
        'debris',
        'Logging a debris report.',
    ),
    (
        ('police',),
        'police',
        'Logging a police report.',
    ),
    (
        ('camera',),
        'speed_camera',
        'Logging a speed camera report at your current location.',
    ),
)


def normalize_voice_hazard_type(hazard_type: Optional[str]) -> Optional[str]:
    """Map aliases to canonical community hazard types."""
    if not isinstance(hazard_type, str):
        return None
    normalized = hazard_type.strip().lower()
    if not normalized:
        return None
    return VOICE_HAZARD_TYPE_ALIASES.get(normalized, normalized)


def severity_for_voice_hazard_type(hazard_type: Optional[str]) -> str:
    """Match road-report modal: accidents are high severity."""
    canonical = normalize_voice_hazard_type(hazard_type)
    return 'high' if canonical == 'accident' else 'medium'


def _match_rules(
    text: str,
    rules: Sequence[Tuple[Tuple[str, ...], str, str]],
) -> Optional[Dict[str, Any]]:
    for phrases, hazard_type, message in rules:
        if any(p in text for p in phrases):
            canonical = normalize_voice_hazard_type(hazard_type) or hazard_type
            return {
                'hazard_type': canonical,
                'description': text[:240],
                'message': message,
                'severity': severity_for_voice_hazard_type(canonical),
            }
    return None


def classify_voice_hazard_report(
    command: str,
    *,
    require_report_keyword: bool = True,
) -> Optional[Dict[str, Any]]:
    """
    Classify spoken text into a structured hazard report payload.

    Returns None when the utterance is not a hazard report (PWA mode),
    or a structured 'other' report for unrecognized desktop free-form speech.
    """
    text = (command or '').lower().strip()
    if not text:
        return None
    if require_report_keyword and 'report' not in text:
        return None

    # Congestion / traffic jam (PWA historically used hazard_type 'traffic')
    if ('traffic' in text and 'jam' in text) or 'congestion' in text:
        hazard_type = 'congestion'
        return {
            'hazard_type': hazard_type,
            'description': text[:240],
            'message': 'Logging a traffic congestion report.',
            'severity': severity_for_voice_hazard_type(hazard_type),
        }

    matched = _match_rules(text, _PWA_VOICE_HAZARD_RULES)
    if matched:
        return matched

    if not require_report_keyword:
        matched = _match_rules(text, _DESKTOP_EXTRA_HAZARD_RULES)
        if matched:
            return matched
        return {
            'hazard_type': 'other',
            'description': text[:240],
            'message': 'Logging a hazard report.',
            'severity': 'medium',
        }

    return None


def build_desktop_voice_hazard_submission(
    text: str,
    lat: float,
    lon: float,
) -> Optional[Dict[str, Any]]:
    """
    Build a desktop community-hazard submission from free-form/report speech.

    Returns None only for empty text. Otherwise returns a structured payload
    suitable for SatNavApp.submit_hazard_report.
    """
    classified = classify_voice_hazard_report(text, require_report_keyword=False)
    if not classified:
        return None
    hazard_type = normalize_voice_hazard_type(classified['hazard_type'])
    if hazard_type not in DESKTOP_COMMUNITY_HAZARD_TYPES:
        hazard_type = 'other'
    return {
        'hazard_type': hazard_type,
        'lat': lat,
        'lon': lon,
        'description': classified.get('description') or str(text)[:240],
        'severity': classified.get('severity') or severity_for_voice_hazard_type(hazard_type),
        'message': classified.get('message') or 'Logging a hazard report.',
    }
