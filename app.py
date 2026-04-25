import json
import os
import re
import tempfile
import threading
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

from cleaning_pipeline import CrisisGridCleaningPipeline
from services.ai_mapper import AIMapperError, GeminiAIMapper, QuotaExhaustedError
from services.cleaner import CleaningPipelineError
from services.session_store import SessionStore


load_dotenv(override=True)

# --- Security Constants ---
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_QUESTION_LENGTH = 500
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
FIRESTORE_COLLECTION_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,127}$")
FIRESTORE_FIELD_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
ALLOWED_FIRESTORE_OPERATORS = {"==", ">", "<", ">=", "<=", "!=", "array-contains"}

# --- Rate Limiter ---
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # max requests per minute for /clean and /query
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)
_rate_limit_lock = threading.Lock()

# --- App / Global Services ---
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

CORS(
    app,
    origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    supports_credentials=False,
    methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

store = SessionStore()
CLEAN_JOB_EXECUTOR = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("CRISISGRID_JOB_WORKERS", "2"))),
    thread_name_prefix="crisisgrid-clean-job",
)
PIPELINE = CrisisGridCleaningPipeline()
FIRESTORE_DB = None


def _init_firebase_admin() -> firestore.Client:
    """
    Initialize Firebase Admin SDK with service account path from env:
    FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    """
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH", "").strip()
    if not cred_path:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_KEY_PATH is required for Firestore integration.")
    if not Path(cred_path).is_file():
        raise RuntimeError(f"Firebase service account key file not found: {cred_path}")

    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)

    return firestore.client()


def _get_client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip() or "unknown"
    return request.remote_addr or "unknown"


@app.before_request
def _rate_limit_middleware() -> Optional[Response]:
    if request.path not in ("/clean", "/query"):
        return None

    client_ip = _get_client_ip()
    now = time.time()
    with _rate_limit_lock:
        _rate_limit_store[client_ip] = [
            t for t in _rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW
        ]
        if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
            return jsonify(
                {
                    "code": "RATE_LIMITED",
                    "message": "Too many requests. Please wait a moment.",
                }
            ), 429
        _rate_limit_store[client_ip].append(now)
    return None


@app.after_request
def _security_headers_middleware(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def _validate_session_id(session_id: str) -> str:
    if not SESSION_ID_PATTERN.match(session_id):
        raise ValueError("Invalid session ID format.")
    return session_id


def _validate_job_id(job_id: str) -> str:
    if not JOB_ID_PATTERN.match(job_id):
        raise ValueError("Invalid job ID format.")
    return job_id


def _validate_file_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Only CSV and Excel files are accepted. Got: {ext or 'none'}")


def _extract_error_message(exc: Exception) -> str:
    return str(exc)


def _error_response(code: str, message: str, status: int, details: Optional[Dict[str, Any]] = None):
    payload: Dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return jsonify(payload), status


def _validate_firestore_query(
    query_json: Dict[str, Any],
    *,
    default_collection: Optional[str] = None,
) -> Dict[str, Any]:
    if not isinstance(query_json, dict):
        raise ValueError("Firestore query plan must be a JSON object.")

    collection = str(query_json.get("collection") or default_collection or "").strip()
    if not collection:
        raise ValueError("Firestore query plan is missing 'collection'.")
    if not FIRESTORE_COLLECTION_PATTERN.match(collection):
        raise ValueError("Invalid Firestore collection name.")

    raw_filters = query_json.get("filters", [])
    if raw_filters is None:
        raw_filters = []
    if not isinstance(raw_filters, list):
        raise ValueError("'filters' must be an array of [field, operator, value].")

    filters: List[List[Any]] = []
    for raw_filter in raw_filters:
        if not isinstance(raw_filter, (list, tuple)) or len(raw_filter) != 3:
            raise ValueError("Each filter must have exactly 3 elements: [field, operator, value].")
        field, operator, value = raw_filter
        field_s = str(field).strip()
        op_s = str(operator).strip()
        if not FIRESTORE_FIELD_PATTERN.match(field_s):
            raise ValueError(f"Invalid Firestore field name in filters: {field_s}")
        if op_s not in ALLOWED_FIRESTORE_OPERATORS:
            raise ValueError(f"Unsupported Firestore operator: {op_s}")
        filters.append([field_s, op_s, value])

    raw_limit = query_json.get("limit", 100)
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        limit = 100
    if limit <= 0:
        limit = 100
    limit = min(limit, 100)

    explanation = str(query_json.get("explanation", "")).strip()

    return {
        "collection": collection,
        "filters": filters,
        "limit": limit,
        "explanation": explanation,
    }


def _plan_firestore_query(
    mapper: GeminiAIMapper,
    question: str,
    session_meta: Dict[str, Any],
) -> Dict[str, Any]:
    schema = [
        {"column": col, "dtype": session_meta.get("dtypes", {}).get(col, "TEXT")}
        for col in session_meta.get("columns", [])
    ]
    preferred_collection = _collection_for_file_type(session_meta.get("file_type", ""))

    payload = {
        "task": "question_to_firestore_query",
        "question": question,
        "available_collections": [
            "beneficiaries",
            "inventory",
            "donors",
        ],
        "preferred_collection": preferred_collection,
        "schema": schema,
        "profile": session_meta.get("profile", {}),
        "rules": [
            "Return strict JSON only.",
            "Return exactly one object matching the output schema.",
            "Use only these operators: ==, >, <, >=, <=, !=, array-contains.",
            "Firestore does not support JOINs. Query only one collection.",
            "Limit the result to 100 records unless specified otherwise.",
        ],
        "output_schema": {
            "collection": "string",
            "filters": [["field", "operator", "value"]],
            "limit": "number",
            "explanation": "string",
        },
    }

    data = mapper.request_json(payload)
    return _validate_firestore_query(data, default_collection=preferred_collection)


def _smart_fallback_firestore_query(
    question: str,
    session_meta: Dict[str, Any],
    session_id: str,
) -> Dict[str, Any]:
    del question  # Not used in deterministic fallback currently.
    preferred_collection = _collection_for_file_type(session_meta.get("file_type", "")) or "beneficiaries"
    fallback_query = {
        "collection": preferred_collection,
        "filters": [["session_id", "==", session_id]],
        "limit": 100,
        "explanation": "Fallback Firestore query scoped to the current session.",
    }
    return _validate_firestore_query(fallback_query, default_collection=preferred_collection)


def execute_firestore_query(query_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    if FIRESTORE_DB is None:
        raise RuntimeError("Firestore client is not initialized.")

    query_plan = _validate_firestore_query(query_json)
    query_ref = FIRESTORE_DB.collection(query_plan["collection"])
    for field, operator, value in query_plan["filters"]:
        query_ref = query_ref.where(field, operator, value)
    query_ref = query_ref.limit(query_plan["limit"])

    docs = query_ref.stream()
    results: List[Dict[str, Any]] = []
    for doc in docs:
        row = doc.to_dict() or {}
        row["id"] = doc.id
        results.append(row)
    return results


def _answer_from_query_result(
    mapper: GeminiAIMapper,
    question: str,
    query_plan: Dict[str, Any],
    result_rows: List[Dict[str, Any]],
    result_columns: List[str],
) -> str:
    if not result_rows:
        return "No matching records were found for this question."

    preview = result_rows[:30]
    prompt = (
        "You are CrisisGrid's data assistant. "
        "Write a concise plain-English answer based only on the query result below.\n\n"
        f"Question: {question}\n"
        f"Executed Firestore Query JSON: {json.dumps(query_plan, ensure_ascii=False)}\n"
        f"Result columns: {result_columns}\n"
        f"Result row count: {len(result_rows)}\n"
        f"Result preview: {json.dumps(preview, ensure_ascii=False)}\n\n"
        "Answer in 1-3 sentences."
    )
    return mapper.generate_text(prompt=prompt, temperature=0.1)


def _fallback_answer(question: str, query_description: str, result_rows: List[Dict[str, Any]]) -> str:
    del question, query_description  # Keep signature for future expansion.
    if not result_rows:
        return "No matching records were found using local fallback."

    if len(result_rows) == 1:
        first_row = result_rows[0]
        if "total_records" in first_row:
            return f"The dataset contains {first_row['total_records']} matching records."
        if "unique_values" in first_row:
            return f"There are {first_row['unique_values']} unique values for the requested field."

    if "freq" in result_rows[0] and "value" in result_rows[0]:
        top = [f"{r['value']} ({r['freq']})" for r in result_rows[:5]]
        return f"The top values are: {', '.join(top)}."

    return f"Found {len(result_rows)} matching records using local fallback analysis."


def _is_greeting(text: str) -> bool:
    greetings = {"hi", "hello", "hey", "help", "thanks", "thank you", "who are you"}
    cleaned = re.sub(r"[^a-zA-Z\s]", "", text.lower()).strip()
    return cleaned in greetings


def _generate_insights_payload(session_meta: Dict[str, Any], sample_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "task": "generate_dashboard_insights",
        "instructions": [
            "Generate exactly 3 actionable NGO insights.",
            "Each insight should be under 20 words.",
            "Use dataset profile and samples only.",
            "Return strict JSON only.",
        ],
        "session_meta": {
            "file_type": session_meta.get("file_type"),
            "record_count": session_meta.get("record_count"),
            "summary": session_meta.get("summary", {}),
            "profile": session_meta.get("profile", {}),
        },
        "sample_rows": sample_rows,
        "output_schema": {"insights": ["string", "string", "string"]},
    }


def _collection_for_file_type(file_type: str) -> Optional[str]:
    mapping = {
        "beneficiary": "beneficiaries",
        "inventory": "inventory",
        "donor": "donors",
    }
    return mapping.get((file_type or "").lower().strip())


def _update_firestore_session_doc(
    session_id: str,
    *,
    status: str,
    progress: int,
    message: str,
    file_type: Optional[str] = None,
    summary: Optional[Dict[str, Any]] = None,
    record_count: Optional[int] = None,
    error: Optional[str] = None,
) -> None:
    if FIRESTORE_DB is None:
        return

    payload: Dict[str, Any] = {
        "session_id": session_id,
        "status": status,
        "progress": max(0, min(100, int(progress))),
        "message": message,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if file_type is not None:
        payload["file_type"] = file_type
    if summary is not None:
        payload["summary"] = summary
    if record_count is not None:
        payload["record_count"] = int(record_count)
    if error is not None:
        payload["error"] = error
    if status == "processing":
        payload["started_at"] = firestore.SERVER_TIMESTAMP
    if status == "completed":
        payload["completed_at"] = firestore.SERVER_TIMESTAMP

    FIRESTORE_DB.collection("sessions").document(session_id).set(payload, merge=True)


def _write_records_to_firestore(
    session_id: str,
    file_type: str,
    records: List[Dict[str, Any]],
) -> None:
    if FIRESTORE_DB is None:
        return

    target_collection = _collection_for_file_type(file_type)
    if not target_collection:
        return

    collection_ref = FIRESTORE_DB.collection(target_collection)
    batch_size = 450

    for start in range(0, len(records), batch_size):
        batch = FIRESTORE_DB.batch()
        chunk = records[start : start + batch_size]
        for idx, record in enumerate(chunk, start=start):
            doc_ref = collection_ref.document()
            payload = dict(record or {})
            payload["session_id"] = session_id
            payload["file_type"] = file_type
            payload["row_index"] = idx
            payload["synced_at"] = firestore.SERVER_TIMESTAMP
            batch.set(doc_ref, payload)
        batch.commit()


def _run_clean_job(job_id: str, filename: str, file_bytes: bytes) -> None:
    session_id = uuid.uuid4().hex
    try:
        _update_firestore_session_doc(
            session_id=session_id,
            status="processing",
            progress=0,
            message=f"Received file: {filename}",
        )

        last_progress = {"value": -1, "message": "", "ts": 0.0}

        def progress(progress_value: int, message: str) -> None:
            now = time.monotonic()
            safe_value = max(0, min(100, int(progress_value)))
            should_write_local = (
                safe_value >= 100
                or abs(safe_value - last_progress["value"]) >= 2
                or message != last_progress["message"]
                or (now - last_progress["ts"]) >= 1.0
            )
            if not should_write_local:
                return

            store.update_job(
                job_id,
                status="processing",
                progress=safe_value,
                message=message,
            )
            _update_firestore_session_doc(
                session_id=session_id,
                status="processing",
                progress=safe_value,
                message=message,
            )
            last_progress["value"] = safe_value
            last_progress["message"] = message
            last_progress["ts"] = now

        result = PIPELINE.process_file(
            filename=filename,
            file_bytes=file_bytes,
            progress_callback=progress,
        )

        file_type = result.get("fileType", "unknown")
        cleaned_docs = result.get("cleanedDocuments", [])
        summary = result.get("summary", {})

        store.save_session(
            session_id=session_id,
            file_type=file_type,
            records=cleaned_docs,
            summary=summary,
        )

        store.update_job(
            job_id,
            status="completed",
            progress=100,
            message="Processing complete",
            session_id=session_id,
            summary=summary,
        )

        _write_records_to_firestore(session_id=session_id, file_type=file_type, records=cleaned_docs)
        _update_firestore_session_doc(
            session_id=session_id,
            status="completed",
            progress=100,
            message="Processing complete",
            file_type=file_type,
            summary=summary,
            record_count=len(cleaned_docs),
        )
    except Exception as exc:  # noqa: BLE001
        store.update_job(
            job_id,
            status="failed",
            progress=100,
            message="Processing failed",
            error=_extract_error_message(exc),
        )
        _update_firestore_session_doc(
            session_id=session_id,
            status="failed",
            progress=100,
            message="Processing failed",
            error=_extract_error_message(exc),
        )


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.post("/clean")
def clean_upload() -> Any:
    try:
        uploaded = request.files.get("file")
        if uploaded is None:
            return _error_response("FILE_REQUIRED", "No file was uploaded.", 400)

        filename = uploaded.filename or "upload"
        _validate_file_extension(filename)

        raw = uploaded.read()
        if not raw:
            return _error_response("EMPTY_UPLOAD", "Uploaded file is empty.", 400)
        if len(raw) > MAX_UPLOAD_BYTES:
            return _error_response(
                "FILE_TOO_LARGE",
                f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB size limit.",
                413,
            )

        job_id = store.create_job(filename=filename)
        CLEAN_JOB_EXECUTOR.submit(_run_clean_job, job_id, filename, raw)
        return jsonify({"job_id": job_id, "status": "processing"})
    except ValueError as exc:
        return _error_response("INVALID_FILE_TYPE", str(exc), 400)
    except Exception:
        return _error_response(
            "INTERNAL_ERROR",
            "An unexpected error occurred during upload.",
            500,
        )


@app.get("/status/<job_id>")
def get_job_status(job_id: str) -> Any:
    try:
        _validate_job_id(job_id)
    except ValueError as exc:
        return _error_response("INVALID_JOB", str(exc), 400)

    job = store.get_job(job_id)
    if not job:
        return _error_response("JOB_NOT_FOUND", "Job not found.", 404)

    response = {
        "job_id": job.get("job_id"),
        "status": job.get("status"),
        "progress": int(job.get("progress") or 0),
        "message": job.get("message"),
    }
    if job.get("status") == "completed":
        response["session_id"] = job.get("session_id")
        response["summary"] = job.get("summary")
    if job.get("status") == "failed":
        response["error"] = job.get("error")

    return jsonify(response)


@app.get("/data/<session_id>")
def get_session_data(session_id: str) -> Any:
    try:
        _validate_session_id(session_id)
    except ValueError as exc:
        return _error_response("INVALID_SESSION", str(exc), 400)

    meta = store.get_session_meta(session_id)
    if not meta:
        return _error_response("SESSION_NOT_FOUND", "Session not found.", 404)

    try:
        page = int(request.args.get("page", "1"))
        limit = int(request.args.get("limit", "50"))
    except ValueError:
        return _error_response("INVALID_PAGINATION", "Page and limit must be integers.", 400)

    if page < 1:
        return _error_response("INVALID_PAGINATION", "Page must be >= 1.", 400)
    if limit < 1 or limit > 500:
        return _error_response("INVALID_PAGINATION", "Limit must be between 1 and 500.", 400)

    page_data = store.get_session_page(session_id=session_id, page=page, limit=limit)
    return jsonify(
        {
            "session_id": session_id,
            "file_type": meta.get("file_type"),
            "columns": meta.get("columns", []),
            "summary": meta.get("summary", {}),
            "page": page_data["page"],
            "limit": page_data["limit"],
            "total_records": page_data["total_records"],
            "rows": page_data["rows"],
        }
    )


@app.post("/query")
def query_data() -> Any:
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question", "")).strip()
    session_id = str(payload.get("session_id", "")).strip()

    try:
        _validate_session_id(session_id)
    except ValueError as exc:
        return _error_response("INVALID_SESSION", str(exc), 400)

    if not question:
        return _error_response("INVALID_QUESTION", "Question is required.", 400)
    if len(question) > MAX_QUESTION_LENGTH:
        return _error_response(
            "QUESTION_TOO_LONG",
            f"Question must be under {MAX_QUESTION_LENGTH} characters.",
            400,
        )

    if _is_greeting(question):
        return jsonify(
            {
                "answer": (
                    "Hello! I'm CrisisGrid AI. I'm here to help you analyze your disaster relief dataset. "
                    "Ask questions like 'How many beneficiaries are there?' "
                    "or 'Which camps are running low on supplies?'."
                ),
                "query": None,
                "result_count": 0,
                "results_preview": [],
                "source": "conversational",
            }
        )

    session_meta = store.get_session_meta(session_id)
    if not session_meta:
        return _error_response("SESSION_NOT_FOUND", "Session not found.", 404)

    try:
        mapper = GeminiAIMapper()
        source = "ai"
        warning = None

        try:
            query_plan = _plan_firestore_query(mapper, question, session_meta)
        except QuotaExhaustedError:
            query_plan = _smart_fallback_firestore_query(question, session_meta, session_id)
            source = "fallback"
            warning = "AI quota exceeded. Analysis was performed locally."
        except (AIMapperError, ValueError):
            query_plan = _smart_fallback_firestore_query(question, session_meta, session_id)
            source = "fallback"
        
        # Always scope NLQ results to the current session.
        existing_scope = any(
            isinstance(item, (list, tuple))
            and len(item) == 3
            and str(item[0]).strip() == "session_id"
            and str(item[1]).strip() == "=="
            and str(item[2]).strip() == session_id
            for item in query_plan.get("filters", [])
        )
        if not existing_scope:
            query_plan["filters"].append(["session_id", "==", session_id])
        query_plan = _validate_firestore_query(query_plan)

        rows = execute_firestore_query(query_plan)
        columns = sorted({key for row in rows for key in row.keys()})

        try:
            if source == "fallback":
                answer = _fallback_answer(question, json.dumps(query_plan, ensure_ascii=False), rows)
            else:
                answer = _answer_from_query_result(
                    mapper=mapper,
                    question=question,
                    query_plan=query_plan,
                    result_rows=rows,
                    result_columns=columns,
                )
        except QuotaExhaustedError:
            answer = _fallback_answer(question, json.dumps(query_plan, ensure_ascii=False), rows)
            source = "fallback"
            warning = "AI quota exceeded. Answer was generated locally."
        except Exception:
            answer = _fallback_answer(question, json.dumps(query_plan, ensure_ascii=False), rows)
            source = "fallback"

        return jsonify(
            {
                "answer": answer,
                "query": query_plan,
                "explanation": query_plan.get("explanation"),
                "result_count": len(rows),
                "results_preview": rows[:50],
                "source": source,
                "warning": warning,
            }
        )
    except Exception:
        return _error_response(
            "QUERY_ERROR",
            "An error occurred while processing your query.",
            500,
        )


@app.get("/insights/<session_id>")
def get_insights(session_id: str) -> Any:
    try:
        _validate_session_id(session_id)
    except ValueError as exc:
        return _error_response("INVALID_SESSION", str(exc), 400)

    meta = store.get_session_meta(session_id)
    if not meta:
        return _error_response("SESSION_NOT_FOUND", "Session not found.", 404)

    if meta.get("insights"):
        return jsonify({"session_id": session_id, "insights": meta["insights"]})

    summary = meta.get("summary", {})
    fallback = [
        f"Processed {meta.get('record_count', 0)} cleaned records.",
        f"Fixed {summary.get('totalFixed', 0)} quality issues automatically.",
        f"Removed {summary.get('removedDuplicates', 0)} duplicates to improve consistency.",
    ]

    try:
        mapper = GeminiAIMapper()
        sample_rows = store.get_session_rows(session_id, limit=40)
        payload = _generate_insights_payload(meta, sample_rows)
        data = mapper.request_json(payload)
        insights = data.get("insights", [])
        if not isinstance(insights, list):
            insights = []
        insights = [str(x).strip() for x in insights if str(x).strip()][:3]
        insights = (insights + fallback)[:3]
    except Exception:
        insights = fallback

    store.set_insights(session_id, insights)
    return jsonify({"session_id": session_id, "insights": insights})


@app.get("/reports/<session_id>")
def get_report(session_id: str) -> Any:
    try:
        _validate_session_id(session_id)
    except ValueError as exc:
        return _error_response("INVALID_SESSION", str(exc), 400)

    meta = store.get_session_meta(session_id)
    if not meta:
        return _error_response("SESSION_NOT_FOUND", "Session not found.", 404)

    summary = meta.get("summary", {})
    profile = meta.get("profile", {})
    report_lines = [
        "CrisisGrid Report Summary",
        "========================",
        f"Session ID: {session_id}",
        f"File Type: {meta.get('file_type', 'unknown')}",
        f"Record Count: {meta.get('record_count', 0)}",
        "",
        "Cleaning Summary",
        "----------------",
        f"Total Fixed: {summary.get('totalFixed', 0)}",
        f"Removed Duplicates: {summary.get('removedDuplicates', 0)}",
        f"Dropped Invalid Rows: {summary.get('droppedInvalidRows', 0)}",
        "",
        "Columns",
        "-------",
        ", ".join(meta.get("columns", [])) or "None",
        "",
        "Top Categorical Values",
        "----------------------",
    ]

    top_values = profile.get("topCategoricalValues", {})
    for col, values in top_values.items():
        report_lines.append(f"- {col}: {', '.join(values[:5]) if values else 'None'}")

    error_logs = summary.get("error_logs", [])
    if error_logs:
        report_lines.extend(["", "Error Logs (sample)", "-------------------"])
        for item in error_logs[:25]:
            report_lines.append(f"- row {item.get('row_index')}: {item.get('reason')}")

    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        prefix=f"crisisgrid_report_{session_id}_",
        delete=False,
        encoding="utf-8",
    )
    tmp.write("\n".join(report_lines))
    tmp.close()

    return send_file(
        tmp.name,
        mimetype="text/plain",
        as_attachment=True,
        download_name=f"crisisgrid_report_{session_id}.txt",
    )


def _bootstrap() -> None:
    global FIRESTORE_DB
    FIRESTORE_DB = _init_firebase_admin()


_bootstrap()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")), debug=True)
