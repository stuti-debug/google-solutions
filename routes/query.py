import json
from typing import Any, Dict, List, Optional
from flask import Blueprint, request, jsonify

from core.firebase import get_db
from core.security import (
    validate_session_id, 
    FIRESTORE_COLLECTION_PATTERN, 
    FIRESTORE_FIELD_PATTERN, 
    ALLOWED_FIRESTORE_OPERATORS
)
from core.app_globals import store, limiter
from services.ai_mapper import GeminiAIMapper, QuotaExhaustedError, AIMapperError

query_bp = Blueprint('query', __name__)

# --- Firestore Query Logic ---

def _validate_firestore_query(query_json: Dict[str, Any], default_collection: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(query_json, dict):
        raise ValueError("Firestore query plan must be a JSON object.")

    collection = str(query_json.get("collection") or default_collection or "").strip()
    if not collection or not FIRESTORE_COLLECTION_PATTERN.match(collection):
        raise ValueError("Invalid or missing Firestore collection name.")

    raw_filters = query_json.get("filters", [])
    filters: List[List[Any]] = []
    for raw_filter in raw_filters:
        if not isinstance(raw_filter, (list, tuple)) or len(raw_filter) != 3:
            continue
        field, operator, value = raw_filter
        field_s, op_s = str(field).strip(), str(operator).strip()
        if FIRESTORE_FIELD_PATTERN.match(field_s) and op_s in ALLOWED_FIRESTORE_OPERATORS:
            filters.append([field_s, op_s, value])

    limit = min(int(query_json.get("limit", 100)), 100)
    return {
        "collection": collection,
        "filters": filters,
        "limit": max(1, limit),
        "explanation": str(query_json.get("explanation", "")).strip(),
    }

def execute_firestore_query(query_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    db = get_db()
    if db is None:
        raise RuntimeError("Firestore not initialized")
    
    plan = _validate_firestore_query(query_json)
    query_ref = db.collection(plan["collection"])
    for field, operator, value in plan["filters"]:
        query_ref = query_ref.where(field, operator, value)
    
    docs = query_ref.limit(plan["limit"]).stream()
    
    results = []
    for doc in docs:
        d = doc.to_dict()
        for k, v in d.items():
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        d["id"] = doc.id
        results.append(d)
    return results

# --- AI Planning ---

def _plan_firestore_query(mapper: GeminiAIMapper, question: str, session_meta: Dict[str, Any]) -> Dict[str, Any]:
    # Simplified mapping for demonstration - in real use, this uses GeminiAIMapper
    payload = {
        "task": "question_to_firestore_query",
        "question": question,
        "schema": session_meta.get("columns", []),
        "output_schema": {
            "collection": "string",
            "filters": [["field", "operator", "value"]],
            "limit": "number",
            "explanation": "string"
        }
    }
    data = mapper.request_json(payload)
    return _validate_firestore_query(data)

def _is_greeting(text: str) -> bool:
    greetings = {"hi", "hello", "hey", "hola", "greetings", "good morning", "good afternoon"}
    return text.lower().strip() in greetings

# --- Routes ---

@query_bp.route('/query', methods=['POST'])
@limiter.limit("30 per minute")
def query_data():
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question", "")).strip()
    session_id = str(payload.get("session_id", "")).strip()

    if _is_greeting(question):
        return jsonify({
            "answer": "Hello! I'm CrisisGrid AI. How can I help you analyze your disaster relief data today?",
            "query": None,
            "source": "conversational"
        })

    try:
        validate_session_id(session_id)
        if not question:
            return jsonify({"code": "INVALID_QUESTION", "message": "Question is required."}), 400

        session_meta = store.get_session_meta(session_id)
        if not session_meta:
            return jsonify({"code": "SESSION_NOT_FOUND", "message": "Session not found."}), 404

        mapper = GeminiAIMapper()
        try:
            query_plan = _plan_firestore_query(mapper, question, session_meta)
        except Exception:
            # Fallback
            query_plan = {
                "collection": "beneficiaries",
                "filters": [["session_id", "==", session_id]],
                "limit": 50,
                "explanation": "Fallback query"
            }

        # Force session scoping
        scoped = False
        for f in query_plan["filters"]:
            if f[0] == "session_id" and f[2] == session_id:
                scoped = True
                break
        if not scoped:
            query_plan["filters"].append(["session_id", "==", session_id])

        rows = execute_firestore_query(query_plan)
        
        # Generate Answer
        prompt = f"Question: {question}\nData: {json.dumps(rows[:10])}\nAnswer concisely."
        answer = mapper.generate_text(prompt=prompt)

        return jsonify({
            "answer": answer,
            "query": query_plan,
            "explanation": query_plan.get("explanation"),
            "result_count": len(rows),
            "results_preview": rows[:50],
            "source": "ai"
        })

    except Exception as e:
        return jsonify({"code": "QUERY_ERROR", "message": str(e)}), 500
