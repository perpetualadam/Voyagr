"""Optional, server-configured OpenAI-compatible speech transcription boundary.

Only transcribes short user recordings; never interprets commands or executes
model-supplied actions. No SDK, model download, recording storage or default host.
"""
import json
import os
import time
from urllib.parse import urlsplit

import requests

MAX_AUDIO_BYTES = 1024 * 1024
MAX_RESPONSE_BYTES = 65536
AUDIO_TYPES = {'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav'}


class TranscriptionUnavailable(Exception):
    """Unavailable or invalid upstream, with no secret/provider body in the error."""


def configuration():
    base = os.getenv('VOYAGR_STT_BASE_URL', '').strip().rstrip('/')
    model = os.getenv('VOYAGR_STT_MODEL', '').strip()
    try:
        url = urlsplit(base)
        valid = (url.scheme == 'https' or
                 (url.scheme == 'http' and url.hostname in {'localhost', '127.0.0.1', '::1'}))
        if not valid or not url.hostname or url.username or url.password or url.query or url.fragment or not model:
            return None
        _ = url.port
    except ValueError:
        return None
    return {'url': base + '/audio/transcriptions', 'model': model,
            'key': os.getenv('VOYAGR_STT_API_KEY', '').strip()}


def configured():
    return configuration() is not None


def valid_audio(data, mime):
    if mime not in AUDIO_TYPES or not 0 < len(data) <= MAX_AUDIO_BYTES:
        return False
    return ((mime == 'audio/webm' and data.startswith(b'\x1aE\xdf\xa3')) or
            (mime == 'audio/ogg' and data.startswith(b'OggS')) or
            (mime == 'audio/mp4' and data[4:8] == b'ftyp') or
            (mime == 'audio/wav' and data.startswith(b'RIFF') and data[8:12] == b'WAVE'))


def transcribe(data, mime):
    config = configuration()
    if not config or not valid_audio(data, mime):
        raise TranscriptionUnavailable()
    headers = {'Accept': 'application/json'}
    if config['key']:
        headers['Authorization'] = 'Bearer ' + config['key']
    try:
        with requests.post(config['url'], headers=headers,
                           files={'file': ('command.' + AUDIO_TYPES[mime], data, mime)},
                           data={'model': config['model'], 'language': 'en', 'response_format': 'json'},
                           timeout=(3, 20), allow_redirects=False, stream=True) as response:
            if response.status_code != 200:
                raise TranscriptionUnavailable()
            deadline = time.monotonic() + 22
            raw = bytearray()
            for chunk in response.iter_content(4096):
                raw.extend(chunk)
                if len(raw) > MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                    raise TranscriptionUnavailable()
            result = json.loads(raw)
            text = result.get('text') if isinstance(result, dict) else None
            if not isinstance(text, str) or len(text.strip()) > 500:
                raise TranscriptionUnavailable()
            return text.strip()
    except (requests.RequestException, ValueError, TypeError) as error:
        raise TranscriptionUnavailable() from error
