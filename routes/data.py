from flask import Blueprint, request, jsonify
from core.security import validate_session_id
from core.app_globals import store
from core.firebase import get_db
import json
from services.ai_mapper import GeminiAIMapper

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

@data_bp.route('/insights', methods=['POST'])
def get_insights():
    try:
        payload = request.get_json(silent=True) or {}
        session_ids = payload.get("session_ids", [])
        
        if not session_ids:
            return jsonify({"insights": []})

        summaries = []
        for s_id in session_ids:
            try:
                validate_session_id(s_id)
                meta = store.get_session_meta(s_id)
                if not meta:
                    meta = _get_firestore_session_meta(s_id)
                if meta:
                    summaries.append({
                        "file_type": meta.get("file_type"),
                        "record_count": meta.get("record_count"),
                        "summary_stats": meta.get("summary")
                    })
            except Exception:
                continue

        if not summaries:
             return jsonify({"insights": []})
             
        prompt = (
            "You are an AI assistant analyzing multiple disaster relief datasets. "
            "We have uploaded the following datasets. Here is their metadata and summary stats:\n"
            f"{json.dumps(summaries, indent=2)}\n\n"
            "Based on these summaries (such as record counts, error types, duplicate counts), "
            "generate exactly 3 actionable and realistic insights that an NGO coordinator would find useful. "
            "Output strictly as a JSON object matching this schema:\n"
            '{"insights": ["insight 1", "insight 2", "insight 3"]}\n'
            "Return only valid JSON. Do not include markdown blocks."
        )

        mapper = GeminiAIMapper()
        response_text = mapper.generate_text(prompt, temperature=0.2)
        
        # In case the response has markdown formatting
        cleaned = response_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        data = json.loads(cleaned)
        return jsonify(data)
    except Exception as e:
        print("Error generating insights:", e)
        # Fallback to demo insights
        return jsonify({
            "insights": [
                "Error generating real insights. Please check API quota.",
                "Ensure Gemini API key is configured.",
                "Check server logs for details."
            ]
        })

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
