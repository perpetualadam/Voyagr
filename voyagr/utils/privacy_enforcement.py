"""Default-deny retirement of legacy optional plaintext writes.

Future cloud transports must verify permission atomically in their storage transaction.
A remote consent preflight does not authorise a later SQLite/file commit.
"""
from flask import jsonify, request


def legacy_upload_denied(category):
    return jsonify(success=False, error='Optional cloud storage is unavailable',
                   code='CLOUD_UPLOAD_DISABLED', category=category), 403


def block_legacy_writes(blueprint, paths):
    """Retire unscoped writes before parsing bodies or opening private storage."""
    @blueprint.before_request
    def deny_legacy_personal_write():
        for path, methods, category in paths:
            if request.path == path and request.method in methods:
                return legacy_upload_denied(category)
