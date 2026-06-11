import re
from pathlib import Path
from flask import Response, request, jsonify
import firebase_admin
from firebase_admin import auth as firebase_auth

# --- Security Constants ---
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
JOB_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
FIRESTORE_COLLECTION_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,127}$")
FIRESTORE_FIELD_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
ALLOWED_FIRESTORE_OPERATORS = {"==", ">", "<", ">=", "<=", "!=", "array-contains", "contains", "in"}

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

def require_auth():
    if request.method == "OPTIONS":
        return
    if request.path == "/health":
        return
        
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"code": "UNAUTHORIZED", "message": "Missing or invalid Authorization header."}), 401
        
    token = auth_header.split(" ")[1]
    try:
        # Initialize an app instance for auth verification if not exists
        try:
            auth_app = firebase_admin.get_app('auth_app')
        except ValueError:
            auth_app = firebase_admin.initialize_app(options={'projectId': 'crisisgrid-web'}, name='auth_app')
            
        decoded_token = firebase_auth.verify_id_token(token, app=auth_app)
        request.user = decoded_token
    except Exception as e:
        return jsonify({"code": "UNAUTHORIZED", "message": f"Invalid token: {e}"}), 401
