"""Strict private-resource identity using existing Supabase JWTs + live session check."""
import os
from uuid import UUID

import requests
from flask import g, jsonify, request
from voyagr.utils.supabase_auth import verify_supabase_jwt


def authenticate_dashcam_request():
    # No localhost, API-key, cookie, query-string or frontend-user-id bypass.
    parts = request.headers.get('Authorization', '').split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return jsonify(success=False, error='Authentication required'), 401
    token = parts[1]
    try:
        claims = verify_supabase_jwt(token)
        owner = str(UUID(claims['sub']))
        UUID(claims['session_id'])
        if claims.get('role') != 'authenticated' or claims.get('is_anonymous') is True:
            raise ValueError('Not a signed-in user')
    except Exception:
        return jsonify(success=False, error='Invalid authentication'), 401

    url = os.getenv('SUPABASE_URL', '').strip().rstrip('/')
    key = os.getenv('SUPABASE_ANON_KEY', '').strip()
    if not url or not key:
        return jsonify(success=False, error='Session verification unavailable'), 503
    try:
        # Function checks auth.sessions inside the same project on EVERY request.
        # No positive cache: removed/revoked sessions cannot reuse an unexpired JWT.
        response = requests.post(
            url + '/rest/v1/rpc/voyagr_dashcam_session_active', json={},
            headers={'Authorization': 'Bearer ' + token, 'apikey': key},
            timeout=(3, 5), allow_redirects=False,
        )
        if response.status_code in (401, 403):
            return jsonify(success=False, error='Invalid authentication'), 401
        if response.status_code != 200:
            return jsonify(success=False, error='Session verification unavailable'), 503
        if response.json() is not True:
            return jsonify(success=False, error='Invalid authentication'), 401
    except (requests.RequestException, ValueError):
        return jsonify(success=False, error='Session verification unavailable'), 503
    g.dashcam_owner_user_id = owner
