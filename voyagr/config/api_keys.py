"""Production-safe API key loading (PWA routes do not require API keys)."""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path
from typing import Set

logger = logging.getLogger(__name__)

DEV_DEFAULT_API_KEY = 'voyagr-default-key'


def _is_production() -> bool:
    return (
        os.getenv('FLASK_ENV', '').strip().lower() == 'production'
        or os.getenv('ENVIRONMENT', '').strip().lower() == 'production'
    )


def _parse_api_keys(raw: str) -> Set[str]:
    return {k.strip() for k in raw.split(',') if k.strip()}


def _read_key_file(key_file: Path) -> Set[str]:
    try:
        stored = key_file.read_text(encoding='utf-8').strip()
    except OSError:
        return set()
    if not stored:
        return set()
    os.environ.setdefault('API_KEYS', stored)
    return _parse_api_keys(stored)


def _write_key_file_atomic(key_file: Path, new_key: str) -> bool:
    """Create key file if missing; return True if this process wrote it."""
    try:
        fd = os.open(str(key_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    try:
        os.write(fd, new_key.encode('utf-8'))
    finally:
        os.close(fd)
    return True


def load_valid_api_keys(project_root: Path) -> Set[str]:
    """
    Resolve VALID_API_KEYS for @require_auth endpoints.

    - Explicit API_KEYS env: use as-is.
    - Production without API_KEYS: load or create project_root/.api_key (one per server).
    - Development: well-known dev key with a warning (PWA still works without sending a key).
    """
    raw = os.getenv('API_KEYS')
    if raw and str(raw).strip():
        keys = _parse_api_keys(str(raw))
        if keys:
            return keys

    key_file = project_root / '.api_key'
    existing = _read_key_file(key_file)
    if existing:
        logger.info('[SECURITY] Loaded API key from %s', key_file)
        return existing

    if _is_production():
        new_key = secrets.token_urlsafe(32)
        if _write_key_file_atomic(key_file, new_key):
            os.environ['API_KEYS'] = new_key
            logger.info(
                '[SECURITY] Generated production API key at %s '
                '(not required for the PWA; for @require_auth integrations only)',
                key_file,
            )
            return {new_key}
        # Another gunicorn worker won the race — read its file.
        raced = _read_key_file(key_file)
        if raced:
            logger.info('[SECURITY] Using API key created by another worker (%s)', key_file)
            return raced

    logger.warning(
        '[SECURITY] API_KEYS is not set - using built-in development default only. '
        'Set API_KEYS (comma-separated) on any Internet-exposed deployment.'
    )
    return {DEV_DEFAULT_API_KEY}
