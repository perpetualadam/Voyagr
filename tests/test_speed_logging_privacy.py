"""Real detector paths must not disclose coordinates or provider exception text."""
import logging
from unittest.mock import patch
from speed_limit_detector import SpeedLimitDetector


def test_eviction_keeps_cache_working_without_logging_location(caplog):
    detector = SpeedLimitDetector()
    detector.cache_max_size = 1
    private_key = '53.51234567,-1.12345678'
    with caplog.at_level(logging.INFO):
        detector._add_to_cache(private_key, {'speed_limit': 30})
        detector._add_to_cache('replacement', {'speed_limit': 20})
    assert private_key not in detector.speed_limit_cache
    assert detector.speed_limit_cache['replacement']['speed_limit'] == 20
    assert 'Removed oldest entry' in caplog.text
    assert private_key not in caplog.text


def test_provider_exception_reports_category_without_private_url(caplog):
    detector = SpeedLimitDetector()
    private = 'https://provider.invalid/?lat=53.51234567&lon=-1.12345678&key=private-token'
    with patch.object(detector, '_get_posted_speed_limit', side_effect=RuntimeError(private)):
        result = detector.get_speed_limit_for_location(53.51234567, -1.12345678)
    assert result['speed_limit_mph'] is None
    assert private not in caplog.text
    assert '53.51234567' not in caplog.text
    assert 'RuntimeError' in caplog.text
