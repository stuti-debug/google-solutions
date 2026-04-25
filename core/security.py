import re
from pathlib import Path
from typing import Any
from flask import Response

# --- Security Constants ---
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
FIRESTORE_COLLECTION_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,127}$")
FIRESTORE_FIELD_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
ALLOWED_FIRESTORE_OPERATORS = {"==", ">", "<", ">=", "<=", "!=", "array-contains"}

def security_headers_middleware(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

def validate_session_id(session_id: str) -> str:
    if not SESSION_ID_PATTERN.match(session_id):
        raise ValueError("Invalid session ID format.")
    return session_id

def validate_job_id(job_id: str) -> str:
    if not JOB_ID_PATTERN.match(job_id):
        raise ValueError("Invalid job ID format.")
    return job_id

def validate_file_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Only CSV and Excel files are accepted. Got: {ext or 'none'}")
    return ext
