import asyncio
import json
import os
import re
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from cleaning_pipeline import CrisisGridCleaningPipeline
from services.ai_mapper import AIMapperError, GeminiAIMapper, QuotaExhaustedError
from services.cleaner import CleaningPipelineError
from services.session_store import SessionStore

# --- Security Constants ---
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_QUESTION_LENGTH = 500
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")

app = FastAPI(title="CrisisGrid Cleaning API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# --- V9: Lightweight In-Memory Rate Limiter ---
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 30  # max requests per window for mutating endpoints
_rate_limit_store: Dict[str, List[float]] = defaultdict(list)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only rate-limit mutating/expensive endpoints
        if request.url.path in ("/clean", "/query"):
            client_ip = request.client.host if request.client else "unknown"
            now = time.time()
            # Purge expired entries
            _rate_limit_store[client_ip] = [
                t for t in _rate_limit_store[client_ip] if now - t < RATE_LIMIT_WINDOW
            ]
            if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
                return JSONResponse(
                    status_code=429,
                    content={"code": "RATE_LIMITED", "message": "Too many requests. Please wait a moment."},
                )
            _rate_limit_store[client_ip].append(now)
        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

# --- Security Headers ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

app.add_middleware(SecurityHeadersMiddleware)

store = SessionStore()
CLEAN_JOB_EXECUTOR = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("CRISISGRID_JOB_WORKERS", "2"))),
    thread_name_prefix="crisisgrid-clean-job",
)


def _validate_session_id(session_id: str) -> str:
    """Validate session_id is a safe hex string to prevent path traversal."""
    if not SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail={"code": "INVALID_SESSION", "message": "Invalid session ID format."})
    return session_id


def _validate_file_extension(filename: str) -> None:
    """Reject files with unsafe extensions."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_FILE_TYPE", "message": f"Only CSV and Excel files are accepted. Got: {ext or 'none'}"}
        )


class QueryRequest(BaseModel):
    session_id: str
    question: str = Field(..., max_length=MAX_QUESTION_LENGTH)

    @field_validator('session_id')
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        if not SESSION_ID_PATTERN.match(v):
            raise ValueError('Invalid session ID format')
        return v


def _extract_error_message(exc: Exception) -> str:
    return str(exc)


def _validate_sql(sql: str) -> str:
    cleaned = sql.strip().rstrip(";")
    lowered = cleaned.lower()

    # Block multiple statements
    if ";" in cleaned:
        raise ValueError("Multiple SQL statements are not allowed.")

    if not lowered.startswith("select"):
        raise ValueError("Generated query must start with SELECT.")

    if "from dataset" not in lowered:
        raise ValueError("Generated query must reference FROM dataset.")

    # Block SQL comments that could hide malicious code
    if "--" in cleaned or "/*" in cleaned:
        raise ValueError("SQL comments are not allowed.")

    forbidden = [
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "attach",
        "detach",
        "pragma",
        "create",
        "replace",
        "truncate",
        "exec",
        "execute",
        "grant",
        "revoke",
        "union",
        "load_extension",
    ]
    for keyword in forbidden:
        if re.search(rf"\b{keyword}\b", lowered):
            raise ValueError(f"Unsafe SQL keyword detected: {keyword}")

    # Block subqueries accessing other tables
    from_matches = re.findall(r"\bfrom\s+([a-z_][a-z0-9_]*)", lowered)
    for table in from_matches:
        if table != "dataset":
            raise ValueError(f"Query must only reference 'dataset' table, found: {table}")

    return cleaned


def _plan_sql_query(mapper: GeminiAIMapper, question: str, session_meta: Dict[str, Any]) -> str:
    schema = [
        {"column": col, "dtype": session_meta.get("dtypes", {}).get(col, "TEXT")}
        for col in session_meta.get("columns", [])
    ]

    payload = {
        "task": "question_to_sql_for_dataset",
        "dialect": "sqlite",
        "table": "dataset",
        "question": question,
        "schema": schema,
        "profile": session_meta.get("profile", {}),
        "rules": [
            "Return strict JSON only.",
            "Return one safe SELECT query only.",
            "Do not use DDL/DML.",
            "Use table name dataset.",
            "Prefer concise aggregations when possible.",
        ],
        "output_schema": {
            "sql": "string",
            "reason": "string",
        },
    }

    data = mapper.request_json(payload)
    sql = data.get("sql", "")
    return _validate_sql(sql)

def _smart_fallback_sql(question: str, session_meta: Dict[str, Any]) -> str:
    lower_q = question.lower()
    columns = session_meta.get("columns", [])
    
    if not columns:
        return "SELECT * FROM dataset LIMIT 50"

    # Aggregations
    if any(k in lower_q for k in ["how many", "count", "total number"]):
        return "SELECT COUNT(*) AS total_records FROM dataset"

    if any(k in lower_q for k in ["distinct", "unique"]):
        return f"SELECT COUNT(DISTINCT \"{columns[0]}\") AS unique_values FROM dataset"

    # Specific column mentions
    matched_col = next((c for c in columns if c.lower() in lower_q), None)
    
    if matched_col:
        text_cols = [c for c in columns if "float" not in session_meta.get("dtypes", {}).get(c, "object").lower() and "int" not in session_meta.get("dtypes", {}).get(c, "object").lower()]
        
        # If looking for tops/most frequent
        if any(k in lower_q for k in ["top", "most", "frequent", "common"]):
            return (
                f"SELECT \"{matched_col}\" AS value, COUNT(*) AS freq "
                f"FROM dataset GROUP BY \"{matched_col}\" ORDER BY freq DESC LIMIT 10"
            )
            
        # Example: "which villages"
        if "which" in lower_q or "list" in lower_q or "show" in lower_q:
             return f"SELECT DISTINCT \"{matched_col}\" FROM dataset WHERE \"{matched_col}\" IS NOT NULL LIMIT 50"
             
    # fallback top query if no col matches
    if any(k in lower_q for k in ["top", "most", "frequent", "common"]):
        text_col = columns[0] if columns else None
        if text_col:
            return (
                f"SELECT \"{text_col}\" AS value, COUNT(*) AS freq "
                f"FROM dataset GROUP BY \"{text_col}\" ORDER BY freq DESC LIMIT 10"
            )

    return "SELECT * FROM dataset LIMIT 50"


def _answer_from_query_result(
    mapper: GeminiAIMapper,
    question: str,
    sql: str,
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
        f"Executed SQL: {sql}\n"
        f"Result columns: {result_columns}\n"
        f"Result row count: {len(result_rows)}\n"
        f"Result preview: {json.dumps(preview, ensure_ascii=False)}\n\n"
        "Answer in 1-3 sentences."
    )
    return mapper.generate_text(prompt=prompt, temperature=0.1)


def _fallback_answer(question: str, sql: str, result_rows: List[Dict[str, Any]]) -> str:
    if not result_rows:
        return "No matching records were found using local fallback."

    if len(result_rows) == 1:
        first_row = result_rows[0]
        if "total_records" in first_row:
            return f"The dataset contains {first_row['total_records']} matching records."
        if "unique_values" in first_row:
            return f"There are {first_row['unique_values']} unique values for the requested field."
            
        # Simple agg like freq
        keys = list(first_row.keys())
        if len(keys) == 1:
             return f"The result is {first_row[keys[0]]}."

    if "freq" in result_rows[0] and "value" in result_rows[0]:
        top = [f"{r['value']} ({r['freq']})" for r in result_rows[:5]]
        return f"The top values are: {', '.join(top)}."

    return f"Found {len(result_rows)} matching records using local fallback analysis."

def _is_greeting(text: str) -> bool:
    greetings = {"hi", "hello", "hey", "help", "thanks", "thank you", "who are you"}
    cleaned = re.sub(r'[^a-zA-Z\s]', '', text.lower()).strip()
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
        "output_schema": {
            "insights": ["string", "string", "string"],
        },
    }


def _run_clean_job(job_id: str, filename: str, file_bytes: bytes) -> None:
    try:
        pipeline = CrisisGridCleaningPipeline()
        last_progress = {"value": -1, "message": "", "ts": 0.0}

        def progress(progress_value: int, message: str) -> None:
            now = time.monotonic()
            safe_value = max(0, min(100, int(progress_value)))
            if safe_value < 100:
                should_write = (
                    abs(safe_value - last_progress["value"]) >= 2
                    or message != last_progress["message"]
                    or (now - last_progress["ts"]) >= 1.0
                )
                if not should_write:
                    return

            store.update_job(
                job_id,
                status="processing",
                progress=safe_value,
                message=message,
            )
            last_progress["value"] = safe_value
            last_progress["message"] = message
            last_progress["ts"] = now

        result = pipeline.process_file(
            filename=filename,
            file_bytes=file_bytes,
            progress_callback=progress,
        )

        session_id = store.save_session(
            file_type=result.get("fileType", "unknown"),
            records=result.get("cleanedDocuments", []),
            summary=result.get("summary", {}),
        )

        store.update_job(
            job_id,
            status="completed",
            progress=100,
            message="Processing complete",
            session_id=session_id,
            summary=result.get("summary", {}),
        )
    except Exception as exc:  # noqa: BLE001
        store.update_job(
            job_id,
            status="failed",
            progress=100,
            message="Processing failed",
            error=_extract_error_message(exc),
        )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/clean")
async def clean_upload(
    file: UploadFile = File(...),
) -> dict:
    try:
        filename = file.filename or "upload"

        # V2: Validate file extension
        _validate_file_extension(filename)

        # V1: Enforce upload size limit
        raw = await file.read()
        if not raw:
            raise HTTPException(status_code=400, detail={"code": "EMPTY_UPLOAD", "message": "Uploaded file is empty."})
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail={"code": "FILE_TOO_LARGE", "message": f"File exceeds the {MAX_UPLOAD_BYTES // (1024*1024)}MB size limit."}
            )

        job_id = store.create_job(filename=filename)
        CLEAN_JOB_EXECUTOR.submit(_run_clean_job, job_id, filename, raw)

        return {
            "job_id": job_id,
            "status": "processing",
        }
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"code": "INTERNAL_ERROR", "message": "An unexpected error occurred during upload."}) from None


@app.get("/status/{job_id}")
def get_job_status(job_id: str) -> dict:
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail={"code": "JOB_NOT_FOUND", "message": "Job not found."})

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

    return response


@app.post("/query")
def query_data(payload: QueryRequest) -> dict:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail={"code": "INVALID_QUESTION", "message": "Question is required."})
    if len(question) > MAX_QUESTION_LENGTH:
        raise HTTPException(status_code=400, detail={"code": "QUESTION_TOO_LONG", "message": f"Question must be under {MAX_QUESTION_LENGTH} characters."})

    if _is_greeting(question):
        return {
            "answer": "Hello! I'm CrisisGrid AI. I'm here to help you analyze your disaster relief dataset. Feel free to ask me questions like 'How many beneficiaries are there?' or 'Which camps are running low on supplies?'.",
            "sql": None,
            "result_count": 0,
            "results_preview": [],
            "source": "conversational"
        }

    session_meta = store.get_session_meta(payload.session_id)
    if not session_meta:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."})

    try:
        mapper = GeminiAIMapper()
        source = "ai"
        warning = None
        
        try:
            sql = _plan_sql_query(mapper, question, session_meta)
        except QuotaExhaustedError:
            sql = _smart_fallback_sql(question, session_meta)
            source = "fallback"
            warning = "AI quota exceeded. Analysis was performed locally."
        except (AIMapperError, ValueError):
            sql = _smart_fallback_sql(question, session_meta)
            source = "fallback"

        query_result = store.execute_sql_on_session(
            session_id=payload.session_id,
            sql=sql,
            limit=300,
        )
        rows = query_result.get("rows", [])
        columns = query_result.get("columns", [])

        try:
            if source == "fallback":
                answer = _fallback_answer(question, sql, rows)
            else:
                answer = _answer_from_query_result(
                    mapper=mapper,
                    question=question,
                    sql=sql,
                    result_rows=rows,
                    result_columns=columns,
                )
        except QuotaExhaustedError:
            answer = _fallback_answer(question, sql, rows)
            source = "fallback"
            warning = "AI quota exceeded. Answer was generated locally."
        except Exception:
            answer = _fallback_answer(question, sql, rows)
            source = "fallback"

        return {
            "answer": answer,
            "sql": sql,
            "result_count": len(rows),
            "results_preview": rows[:50],
            "source": source,
            "warning": warning
        }
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"code": "QUERY_ERROR", "message": "An error occurred while processing your query."}) from None


@app.get("/data/{session_id}")
def get_session_data(
    session_id: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
) -> dict:
    _validate_session_id(session_id)
    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."})

    page_data = store.get_session_page(session_id=session_id, page=page, limit=limit)
    return {
        "session_id": session_id,
        "file_type": meta.get("file_type"),
        "columns": meta.get("columns", []),
        "summary": meta.get("summary", {}),
        "page": page_data["page"],
        "limit": page_data["limit"],
        "total_records": page_data["total_records"],
        "rows": page_data["rows"],
    }


@app.get("/insights/{session_id}")
async def get_insights(session_id: str) -> dict:
    _validate_session_id(session_id)
    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."})

    if meta.get("insights"):
        return {
            "session_id": session_id,
            "insights": meta["insights"],
        }

    def generate() -> List[str]:
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
            return (insights + fallback)[:3]
        except Exception:
            return fallback

    try:
        insights = await asyncio.to_thread(generate)
        store.set_insights(session_id, insights)
        return {
            "session_id": session_id,
            "insights": insights,
        }
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"code": "INSIGHTS_ERROR", "message": "An error occurred while generating insights."}) from None


@app.get("/reports/{session_id}")
def get_report(session_id: str) -> FileResponse:
    # V4: Validate session_id to prevent path traversal
    _validate_session_id(session_id)

    meta = store.get_session_meta(session_id)
    if not meta:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found."})

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

    # V11: Use temp file instead of accumulating on disk
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", prefix=f"crisisgrid_report_{session_id}_",
        delete=False, encoding="utf-8"
    )
    tmp.write("\n".join(report_lines))
    tmp.close()

    return FileResponse(
        path=tmp.name,
        media_type="text/plain",
        filename=f"crisisgrid_report_{session_id}.txt",
    )
