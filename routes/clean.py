import time
import uuid
from typing import Any, Dict, List, Optional
from flask import Blueprint, request, jsonify
from firebase_admin import firestore

from core.firebase import get_db
from core.security import validate_job_id, validate_file_extension
from core.app_globals import store, CLEAN_JOB_EXECUTOR, PIPELINE, limiter

clean_bp = Blueprint('clean', __name__)

# --- Helper Functions ---

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
    columns: Optional[List[str]] = None,
    error: Optional[str] = None,
) -> None:
    db = get_db()
    if db is None:
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
    if columns is not None:
        payload["columns"] = columns
    if error is not None:
        payload["error"] = error
    if status == "processing":
        payload["started_at"] = firestore.SERVER_TIMESTAMP
    if status == "completed":
        payload["completed_at"] = firestore.SERVER_TIMESTAMP

    db.collection("sessions").document(session_id).set(payload, merge=True)

def _write_records_to_firestore(
    session_id: str,
    file_type: str,
    records: List[Dict[str, Any]],
) -> None:
    db = get_db()
    if db is None:
        return

    target_collection = _collection_for_file_type(file_type)
    if not target_collection:
        return

    collection_ref = db.collection(target_collection)
    batch_size = 450

    for start in range(0, len(records), batch_size):
        batch = db.batch()
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

        # Extract column names for Firestore metadata
        columns = list(cleaned_docs[0].keys()) if cleaned_docs else []

        _update_firestore_session_doc(
            session_id=session_id,
            status="completed",
            progress=100,
            message="Processing complete",
            file_type=file_type,
            summary=summary,
            record_count=len(cleaned_docs),
            columns=columns,
        )
    except Exception as exc:
        store.update_job(
            job_id,
            status="failed",
            progress=100,
            message="Processing failed",
            error=str(exc),
        )
        _update_firestore_session_doc(
            session_id=session_id,
            status="failed",
            progress=100,
            message="Processing failed",
            error=str(exc),
        )

# --- Routes ---

@clean_bp.route('/clean', methods=['POST'])
@limiter.limit("30 per minute")
def clean_upload():
    try:
        uploaded = request.files.get("file")
        if uploaded is None:
            return jsonify({"code": "FILE_REQUIRED", "message": "No file was uploaded."}), 400

        filename = uploaded.filename or "upload"
        validate_file_extension(filename)

        raw = uploaded.read()
        if not raw:
            return jsonify({"code": "EMPTY_UPLOAD", "message": "Uploaded file is empty."}), 400
        
        # Max content length is handled by Flask config, but we can double check
        if len(raw) > (10 * 1024 * 1024):
            return jsonify({"code": "FILE_TOO_LARGE", "message": "File exceeds 10MB limit."}), 413

        job_id = store.create_job(filename=filename)
        CLEAN_JOB_EXECUTOR.submit(_run_clean_job, job_id, filename, raw)
        return jsonify({"job_id": job_id, "status": "processing"})
    except ValueError as exc:
        return jsonify({"code": "INVALID_FILE_TYPE", "message": str(exc)}), 400
    except Exception:
        return jsonify({"code": "INTERNAL_ERROR", "message": "An unexpected error occurred during upload."}), 500

@clean_bp.route('/status/<job_id>', methods=['GET'])
def get_job_status(job_id: str):
    try:
        validate_job_id(job_id)
    except ValueError as exc:
        return jsonify({"code": "INVALID_JOB", "message": str(exc)}), 400

    job = store.get_job(job_id)
    if not job:
        return jsonify({"code": "JOB_NOT_FOUND", "message": "Job not found."}), 404

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
