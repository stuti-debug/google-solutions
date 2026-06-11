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

# Map file_type to collection name used by Gemini
FILE_TYPE_TO_COLLECTION = {
    "beneficiary": "beneficiaries",
    "inventory": "inventory",
    "donor": "donors",
}
COLLECTION_TO_FILE_TYPE = {v: k for k, v in FILE_TYPE_TO_COLLECTION.items()}


def _get_firestore_session_meta(session_id: str) -> Optional[Dict[str, Any]]:
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


def _gather_all_session_meta(session_ids: List[str]) -> List[Dict[str, Any]]:
    """Gather metadata for all provided session IDs."""
    results = []
    for sid in session_ids:
        meta = store.get_session_meta(sid)
        if not meta:
            meta = _get_firestore_session_meta(sid)
        if meta:
            results.append(meta)
    return results


# --- Local Query Execution ---

def _execute_local_query(session_id: str, filters: List[List[Any]], limit: int = 100) -> List[Dict[str, Any]]:
    """Query rows from local SQLite and apply filters in Python."""
    records = store.get_session_rows(session_id, limit=500)
    
    filtered = []
    for row in records:
        match = True
        for field, operator, value in filters:
            if field == "session_id":
                continue
                
            row_val = row.get(field)
            if row_val is None:
                match = False
                break
                
            if operator == "==":
                if str(row_val).strip().lower() != str(value).strip().lower():
                    match = False
                    break
            elif operator == "!=":
                if str(row_val).strip().lower() == str(value).strip().lower():
                    match = False
                    break
            elif operator == "contains":
                if str(value).strip().lower() not in str(row_val).strip().lower():
                    match = False
                    break
            elif operator == "in":
                if isinstance(value, list):
                    if str(row_val).strip().lower() not in [str(v).strip().lower() for v in value]:
                        match = False
                        break
                else:
                    if str(row_val).strip().lower() != str(value).strip().lower():
                        match = False
                        break
            elif operator == ">":
                try:
                    if float(row_val) <= float(value): match = False; break
                except: match = False; break
            elif operator == "<":
                try:
                    if float(row_val) >= float(value): match = False; break
                except: match = False; break
            elif operator == ">=":
                try:
                    if float(row_val) < float(value): match = False; break
                except: match = False; break
            elif operator == "<=":
                try:
                    if float(row_val) > float(value): match = False; break
                except: match = False; break
                
        if match:
            filtered.append(row)
            if len(filtered) >= limit:
                break
                
    return filtered


# --- AI Planning ---

def _plan_query_with_context(mapper: GeminiAIMapper, question: str, all_meta: List[Dict[str, Any]], sample_rows_map: Dict[str, List[Dict]]) -> Dict[str, Any]:
    """
    Send Gemini the full context of ALL uploaded datasets so it can pick the
    right collection AND use the correct field names for filtering.
    """
    # Build a description of every available dataset
    datasets_description = []
    for meta in all_meta:
        ft = meta.get("file_type", "unknown")
        collection = FILE_TYPE_TO_COLLECTION.get(ft, ft)
        columns = meta.get("columns", [])
        sample = sample_rows_map.get(meta["session_id"], [])
        desc = {
            "collection": collection,
            "file_type": ft,
            "columns": columns,
            "record_count": meta.get("record_count", 0),
            "sample_rows": sample[:3],
        }
        datasets_description.append(desc)

    payload = {
        "task": "question_to_query",
        "question": question,
        "available_datasets": datasets_description,
        "instructions": [
            "Pick the single most relevant collection for this question",
            "Use ONLY column names that exist in that dataset's columns list",
            "Prefer 'contains' over '==' for text matching to improve robustness",
            "For filter values, match the casing/format seen in sample_rows",
            "Return strict JSON only, no markdown",
        ],
        "output_schema": {
            "collection": "string (one of the available collection names)",
            "filters": [["column_name", "operator", "value"]],
            "limit": "number (default 100)",
            "explanation": "string"
        }
    }
    data = mapper.request_json(payload)
    return data


def _is_greeting(text: str) -> bool:
    greetings = {"hi", "hello", "hey", "hola", "greetings", "good morning", "good afternoon"}
    return text.lower().strip() in greetings

# --- Routes ---

@query_bp.route('/query', methods=['POST'])
@limiter.limit("30 per minute")
def query_data():
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question", "")).strip()
    
    # Accept both single session_id and session_ids map/list
    session_id = str(payload.get("session_id", "")).strip()
    session_ids_raw = payload.get("session_ids")
    
    # Build a list of all valid session IDs
    all_session_ids = []
    if session_ids_raw:
        if isinstance(session_ids_raw, dict):
            all_session_ids = list(session_ids_raw.values())
        elif isinstance(session_ids_raw, list):
            all_session_ids = session_ids_raw
    if session_id and session_id not in all_session_ids:
        all_session_ids.append(session_id)
    
    # Remove empty strings
    all_session_ids = [s for s in all_session_ids if s and s.strip()]

    if _is_greeting(question):
        return jsonify({
            "answer": "Hello! I'm CrisisGrid AI. How can I help you analyze your disaster relief data today?",
            "query": None,
            "source": "conversational"
        })

    try:
        if not question:
            return jsonify({"code": "INVALID_QUESTION", "message": "Question is required."}), 400
        
        if not all_session_ids:
            return jsonify({"code": "NO_SESSION", "message": "No session data found. Please upload data first."}), 400

        # Validate all session IDs
        for sid in all_session_ids:
            validate_session_id(sid)

        # Gather metadata for all sessions
        all_meta = _gather_all_session_meta(all_session_ids)
        if not all_meta:
            return jsonify({"code": "SESSION_NOT_FOUND", "message": "No valid sessions found."}), 404

        # Pre-fetch sample rows for each session so Gemini can see real data
        sample_rows_map = {}
        for meta in all_meta:
            sid = meta["session_id"]
            rows = store.get_session_rows(sid, limit=3)
            sample_rows_map[sid] = rows

        mapper = GeminiAIMapper()
        
        try:
            query_plan = _plan_query_with_context(mapper, question, all_meta, sample_rows_map)
        except Exception as e:
            return jsonify({
                "answer": "I'm having trouble analyzing the data to answer your question right now. Could you please rephrase it or try again later?",
                "query": None,
                "source": "system"
            })

        # Resolve which session_id to query based on the collection Gemini picked
        target_collection = str(query_plan.get("collection", "")).strip().lower()
        target_file_type = COLLECTION_TO_FILE_TYPE.get(target_collection, target_collection)
        
        # Find the matching session
        target_session_id = None
        target_meta = None
        for meta in all_meta:
            if meta.get("file_type") == target_file_type:
                target_session_id = meta["session_id"]
                target_meta = meta
                break
        
        # Explicitly fail if dataset not found instead of falling back to wrong data
        if not target_session_id:
            return jsonify({
                "answer": f"I cannot answer this question because the required '{target_file_type}' dataset has not been uploaded yet. Please upload it first.",
                "query": None,
                "source": "system"
            })

        # Extract and validate filters
        raw_filters = query_plan.get("filters", [])
        valid_filters = []
        valid_columns = set(target_meta.get("columns", []))
        for f in raw_filters:
            if isinstance(f, (list, tuple)) and len(f) == 3:
                field, op, value = str(f[0]).strip(), str(f[1]).strip(), f[2]
                if field not in valid_columns:
                    continue # Drop hallucinated columns to prevent full filter failure
                if FIRESTORE_FIELD_PATTERN.match(field) and op in ALLOWED_FIRESTORE_OPERATORS:
                    valid_filters.append([field, op, value])

        limit = min(int(query_plan.get("limit", 100)), 100)

        # Execute against the correct session
        rows = _execute_local_query(target_session_id, valid_filters, limit=limit)
        
        # Generate natural language answer using strictly capped context
        sample_rows_json = json.dumps(rows[:10])
        prompt = f"Question: {question}\nTotal records matching your query: {len(rows)}. Here is a sample of the top 10 entries: {sample_rows_json}\nAnswer concisely based on the data. If no data, say so."
        answer = mapper.generate_text(prompt=prompt)

        return jsonify({
            "answer": answer,
            "query": {
                "collection": target_collection,
                "filters": valid_filters,
                "limit": limit,
                "explanation": str(query_plan.get("explanation", "")),
            },
            "explanation": str(query_plan.get("explanation", "")),
            "result_count": len(rows),
            "results_preview": rows[:50],
            "source": "ai"
        })

    except Exception as e:
        return jsonify({"code": "QUERY_ERROR", "message": str(e)}), 500
