"""
Promo coupons: trial days and person-bound lifetime access.

Admin creates codes via POST /api/admin/promo-coupons with header:
  X-Voyagr-Admin-Key: <VOYAGR_COUPON_ADMIN_SECRET>

Users redeem while signed in (Supabase JWT) via POST /api/coupons/redeem.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Optional

from flask import Blueprint, jsonify, request

from voyagr.models import get_db_connection, return_db_connection
from voyagr.utils.supabase_auth import require_supabase_user
from voyagr.utils.entitlements import get_promo_entitlement_dict, utc_now_timestamp

logger = logging.getLogger(__name__)

coupons_bp = Blueprint("coupons", __name__)


def _norm_email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


@coupons_bp.route("/coupons/status", methods=["GET"])
@require_supabase_user
def coupons_status(_jwt_claims):  # type: ignore
    uid = (_jwt_claims or {}).get("sub")
    if not uid:
        return jsonify({"success": False, "error": "Missing subject"}), 401
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        payload = get_promo_entitlement_dict(cursor, uid)
        return jsonify({"success": True, **payload})
    except Exception as e:
        logger.exception("[coupons] status")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            return_db_connection(conn)


@coupons_bp.route("/coupons/redeem", methods=["POST"])
@require_supabase_user
def coupons_redeem(_jwt_claims):  # type: ignore
    uid = (_jwt_claims or {}).get("sub")
    email = _jwt_claims.get("email")
    if not uid:
        return jsonify({"success": False, "error": "Missing subject"}), 401

    data = request.get_json(silent=True) or {}
    code_raw = (data.get("code") or "").strip()
    if not code_raw:
        return jsonify({"success": False, "error": "code is required"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, coupon_kind, trial_days, bound_user_id, bound_email, max_redemptions,
                   redemption_count, expires_at, active
            FROM promo_coupons WHERE code = ? COLLATE NOCASE
            """,
            (code_raw,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Invalid or expired code"}), 400

        cid, kind, trial_days, bound_uid, bound_em, max_r, red_count, exp_at, active = row

        now = utc_now_timestamp()
        if not active:
            return jsonify({"success": False, "error": "Invalid or expired code"}), 400
        if exp_at is not None and exp_at < now:
            return jsonify({"success": False, "error": "Invalid or expired code"}), 400
        if red_count >= max_r:
            return jsonify({"success": False, "error": "This code has already been fully redeemed"}), 400

        if bound_uid and str(bound_uid).strip() != str(uid).strip():
            return jsonify({"success": False, "error": "This code cannot be redeemed for your account"}), 403
        if bound_em and _norm_email(email) != _norm_email(bound_em):
            return jsonify({"success": False, "error": "This code cannot be redeemed for your account"}), 403

        cursor.execute(
            "SELECT 1 FROM promo_redemptions WHERE coupon_id = ? AND user_id = ?",
            (cid, uid),
        )
        if cursor.fetchone():
            return jsonify({"success": False, "error": "You have already redeemed this code"}), 400

        kind = (kind or "").strip().lower()
        if kind == "lifetime":
            cursor.execute(
                """
                INSERT INTO user_entitlements (user_id, lifetime, trial_expires_at, updated_at)
                VALUES (?, 1, NULL, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    lifetime = 1,
                    trial_expires_at = NULL,
                    updated_at = excluded.updated_at
                """,
                (uid, now),
            )
            msg = "Lifetime access activated for your account."
        elif kind == "trial_days":
            td = int(trial_days or 0)
            if td <= 0 or td > 3650:
                return jsonify({"success": False, "error": "Invalid coupon configuration"}), 500
            end_ts = now + td * 86400
            cursor.execute(
                "SELECT lifetime, trial_expires_at FROM user_entitlements WHERE user_id = ?",
                (uid,),
            )
            er = cursor.fetchone()
            if er and er[0]:
                return jsonify({"success": False, "error": "You already have lifetime access"}), 400
            prev_end = er[1] if er else None
            if prev_end and prev_end > now:
                end_ts = max(end_ts, prev_end)
            cursor.execute(
                """
                INSERT INTO user_entitlements (user_id, lifetime, trial_expires_at, updated_at)
                VALUES (?, 0, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    lifetime = 0,
                    trial_expires_at = excluded.trial_expires_at,
                    updated_at = excluded.updated_at
                """,
                (uid, end_ts, now),
            )
            msg = f"Trial active until {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(end_ts))}."
        else:
            return jsonify({"success": False, "error": "Invalid coupon configuration"}), 500

        cursor.execute(
            "INSERT INTO promo_redemptions (coupon_id, user_id, redeemed_at) VALUES (?, ?, ?)",
            (cid, uid, now),
        )
        cursor.execute(
            "UPDATE promo_coupons SET redemption_count = redemption_count + 1 WHERE id = ?",
            (cid,),
        )
        conn.commit()

        payload = get_promo_entitlement_dict(cursor, uid)
        return jsonify({"success": True, "message": msg, **payload})
    except Exception as e:
        if conn:
            conn.rollback()
        logger.exception("[coupons] redeem")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        if conn:
            return_db_connection(conn)


@coupons_bp.route("/admin/promo-coupons", methods=["POST"])
def admin_create_promo_coupon():
    secret = os.getenv("VOYAGR_COUPON_ADMIN_SECRET", "").strip()
    if not secret:
        return jsonify({"success": False, "error": "Admin coupon creation is not configured"}), 503
    if request.headers.get("X-Voyagr-Admin-Key", "").strip() != secret:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    kind = (data.get("coupon_kind") or data.get("kind") or "").strip().lower()
    trial_days = data.get("trial_days")
    bound_user_id = data.get("bound_user_id") or data.get("bound_user") or None
    bound_email = data.get("bound_email") or None
    max_redemptions = int(data.get("max_redemptions") or 1)
    notes = (data.get("notes") or "")[:500]
    expires_at = data.get("expires_at")
    code_in = (data.get("code") or "").strip()

    if kind not in ("trial_days", "lifetime"):
        return jsonify({"success": False, "error": "coupon_kind must be trial_days or lifetime"}), 400
    if kind == "trial_days":
        td = int(trial_days or 0)
        if td <= 0 or td > 3650:
            return jsonify({"success": False, "error": "trial_days must be between 1 and 3650"}), 400
        trial_days = td
    else:
        trial_days = None

    if max_redemptions < 1 or max_redemptions > 1_000_000:
        return jsonify({"success": False, "error": "max_redemptions out of range"}), 400

    code = code_in or secrets.token_hex(5).upper()

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO promo_coupons (
                code, coupon_kind, trial_days, bound_user_id, bound_email,
                max_redemptions, redemption_count, expires_at, active, notes
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
            """,
            (
                code,
                kind,
                trial_days,
                (str(bound_user_id).strip() or None) if bound_user_id else None,
                (str(bound_email).strip() or None) if bound_email else None,
                max_redemptions,
                int(expires_at) if expires_at is not None else None,
                notes or None,
            ),
        )
        conn.commit()
        return jsonify({"success": True, "code": code, "coupon_kind": kind})
    except Exception as e:
        if conn:
            conn.rollback()
        logger.warning("[coupons] admin create failed: %s", e)
        return jsonify({"success": False, "error": str(e)}), 400
    finally:
        if conn:
            return_db_connection(conn)
