"""Server-recognised choices; no payload upload or client-grant trust."""
import os

import requests
from flask import Blueprint, jsonify, request
from voyagr.utils.auth import require_private_user

privacy_bp = Blueprint('privacy', __name__)
CATEGORIES = {'cloudSync', 'history', 'dashcamBackup', 'diagnostics'}
MAX_EPOCH = 9007199254740991


def _state(data):
    """Whitelist authority metadata; never relay arbitrary upstream errors/records."""
    if (not isinstance(data, dict) or type(data.get('schema')) is not int
            or data['schema'] != 1 or not isinstance(data.get('categories'), list)
            or len(data['categories']) != len(CATEGORIES)):
        raise ValueError('Invalid authority response')
    categories = []
    for item in data['categories']:
        if not isinstance(item, dict):
            raise ValueError('Invalid authority response')
        category, version = item.get('category'), item.get('policy_version')
        expiry, epoch = item.get('expires_at'), item.get('epoch')
        if (not isinstance(category, str) or category not in CATEGORIES
                or not isinstance(version, str) or not 1 <= len(version) <= 64
                or type(item.get('enabled')) is not bool
                or type(item.get('available')) is not bool
                or type(epoch) is not int or not 0 <= epoch <= MAX_EPOCH
                or expiry is not None and (not isinstance(expiry, str) or len(expiry) > 64)
                or item['enabled'] and (not item['available'] or expiry is None)):
            raise ValueError('Invalid authority response')
        categories.append({key: item.get(key) for key in
                           ('category', 'policy_version', 'enabled', 'available', 'epoch', 'expires_at')})
    if {item['category'] for item in categories} != CATEGORIES:
        raise ValueError('Invalid authority response')
    return {'schema': 1, 'categories': categories}


def _rpc(name, body):
    base = os.getenv('SUPABASE_URL', '').strip().rstrip('/')
    key = os.getenv('SUPABASE_ANON_KEY', '').strip()
    if not base or not key:
        return jsonify(success=False, error='Privacy authority unavailable'), 503
    try:
        response = requests.post(
            base + '/rest/v1/rpc/' + name, json=body,
            headers={'Authorization': request.headers['Authorization'], 'apikey': key},
            timeout=(3, 5), allow_redirects=False,
        )
        if response.status_code != 200:
            status = response.status_code if response.status_code in {400, 401, 403, 409} else 503
            error = 'Privacy authority unavailable' if status == 503 else 'Privacy choice rejected'
            return jsonify(success=False, error=error), status
        return jsonify(success=True, privacy=_state(response.json()))
    except (requests.RequestException, ValueError, KeyError):
        return jsonify(success=False, error='Privacy authority unavailable'), 503


@privacy_bp.route('/privacy/consent', methods=['GET', 'PUT'])
@require_private_user
def consent(_jwt_claims=None):
    if request.method in {'GET', 'HEAD'}:
        return _rpc('voyagr_privacy_state', {})
    data = request.get_json(silent=True)
    if (not isinstance(data, dict)
            or set(data) - {'category', 'enabled', 'policy_version', 'expected_epoch'}
            or not isinstance(data.get('category'), str) or data['category'] not in CATEGORIES
            or type(data.get('enabled')) is not bool):
        return jsonify(success=False, error='Invalid privacy choice'), 400
    epoch = data.get('expected_epoch', 0)
    version = data.get('policy_version')
    if (type(epoch) is not int or not 0 <= epoch <= MAX_EPOCH
            or version is not None and (not isinstance(version, str) or len(version) > 64)
            or data['enabled'] and (not version or 'expected_epoch' not in data)):
        return jsonify(success=False, error='Invalid privacy choice'), 400
    return _rpc('voyagr_set_privacy_choice', {
        'p_category': data['category'], 'p_enabled': data['enabled'],
        'p_policy_version': version, 'p_expected_epoch': epoch,
    })
