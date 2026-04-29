from flask import Blueprint, request, jsonify
from core.security import validate_session_id
from core.app_globals import store
from core.firebase import get_db

data_bp = Blueprint('data', __name__)


def _get_firestore_session_meta(session_id: str):
    """Fallback: fetch session metadata from Firestore when local SQLite is empty."""
    db = get_db()
    if db is None:
        return None
    try:
        doc = db.collection("sessions").document(session_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        return {
            "session_id": session_id,
            "file_type": data.get("file_type", "unknown"),
            "record_count": data.get("record_count", 0),
            "columns": data.get("columns") or data.get("summary", {}).get("columns", []),
            "summary": data.get("summary", {}),
        }
    except Exception:
        return None


def _get_firestore_session_page(session_id: str, file_type: str, page: int, limit: int):
    """Fallback: fetch paginated session rows from Firestore."""
    db = get_db()
    if db is None:
        return {"page": page, "limit": limit, "total_records": 0, "rows": []}

    # Determine the Firestore collection based on file_type
    collection_map = {
        "beneficiary": "beneficiaries",
        "inventory": "inventory",
        "donor": "donors",
    }
    collection_name = collection_map.get((file_type or "").lower().strip(), "beneficiaries")

    try:
        # Get total count
        all_docs = db.collection(collection_name).where(
            "session_id", "==", session_id
        ).stream()
        all_rows = []
        for doc in all_docs:
            d = doc.to_dict()
            # Convert timestamps to strings
            for k, v in d.items():
                if hasattr(v, "isoformat"):
                    d[k] = v.isoformat()
            # Remove internal fields from the response
            d.pop("session_id", None)
            d.pop("file_type", None)
            d.pop("synced_at", None)
            all_rows.append((d.get("row_index", 0), d))

        # Sort by row_index
        all_rows.sort(key=lambda x: x[0])
        total = len(all_rows)

        # Paginate
        offset = (page - 1) * limit
        page_rows = [row[1] for row in all_rows[offset:offset + limit]]

        # Remove row_index from output
        for row in page_rows:
            row.pop("row_index", None)

        return {
            "page": page,
            "limit": limit,
            "total_records": total,
            "rows": page_rows,
        }
    except Exception:
        return {"page": page, "limit": limit, "total_records": 0, "rows": []}


@data_bp.route('/data/<session_id>', methods=['GET'])
def get_session_data(session_id: str):
    try:
        validate_session_id(session_id)

        # Try local SQLite first
        meta = store.get_session_meta(session_id)
        if meta:
            page = int(request.args.get("page", "1"))
            limit = int(request.args.get("limit", "50"))
            data = store.get_session_page(session_id, page=page, limit=limit)
            return jsonify(data)

        # Fallback to Firestore
        fs_meta = _get_firestore_session_meta(session_id)
        if not fs_meta:
            return jsonify({"code": "SESSION_NOT_FOUND", "message": "Session not found."}), 404

        page = int(request.args.get("page", "1"))
        limit = int(request.args.get("limit", "50"))
        file_type = fs_meta.get("file_type", "beneficiary")
        data = _get_firestore_session_page(session_id, file_type, page, limit)
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
