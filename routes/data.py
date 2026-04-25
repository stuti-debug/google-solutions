from flask import Blueprint, request, jsonify
from core.security import validate_session_id
from core.app_globals import store

data_bp = Blueprint('data', __name__)

@data_bp.route('/data/<session_id>', methods=['GET'])
def get_session_data(session_id: str):
    try:
        validate_session_id(session_id)
        meta = store.get_session_meta(session_id)
        if not meta:
            return jsonify({"code": "SESSION_NOT_FOUND", "message": "Session not found."}), 404

        page = int(request.args.get("page", "1"))
        limit = int(request.args.get("limit", "50"))
        
        data = store.get_session_page(session_id, page=page, limit=limit)
        return jsonify(data)
    except ValueError as exc:
        return jsonify({"code": "INVALID_SESSION", "message": str(exc)}), 400
    except Exception:
        return jsonify({"code": "INTERNAL_ERROR", "message": "Failed to retrieve data."}), 500

@data_bp.route('/insights/<session_id>', methods=['GET'])
def get_insights(session_id: str):
    try:
        validate_session_id(session_id)
        # Dummy insights logic for demo
        return jsonify({
            "insights": [
                "Most beneficiaries are from Chetpet Camp.",
                "Water supply is at critical level in 3 locations.",
                "Food kits distribution is 85% complete."
            ]
        })
    except Exception:
        return jsonify({"insights": []})

@data_bp.route('/reports/<session_id>', methods=['GET'])
def get_reports(session_id: str):
    try:
        validate_session_id(session_id)
        return jsonify({
            "report_url": f"/downloads/report_{session_id}.pdf",
            "generated_at": "2026-04-25T10:00:00Z"
        })
    except Exception:
        return jsonify({"error": "Report generation failed."}), 500
