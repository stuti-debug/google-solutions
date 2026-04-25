import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd


class SessionStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or os.getenv("CRISISGRID_DB_PATH", "crisisgrid.db")
        path = Path(self.db_path)
        if path.parent and str(path.parent) != ".":
            path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL DEFAULT 0,
                    message TEXT,
                    session_id TEXT,
                    summary_json TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    file_type TEXT,
                    record_count INTEGER NOT NULL,
                    columns_json TEXT NOT NULL,
                    dtypes_json TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    summary_json TEXT NOT NULL,
                    insights_json TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS session_rows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    row_index INTEGER NOT NULL,
                    row_json TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session_rows_session ON session_rows(session_id, row_index)")

    def create_job(self, filename: str = "upload") -> str:
        job_id = uuid.uuid4().hex
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs(job_id, status, progress, message, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (job_id, "processing", 0, f"Received file: {filename}", now, now),
            )
        return job_id

    def update_job(
        self,
        job_id: str,
        *,
        status: Optional[str] = None,
        progress: Optional[int] = None,
        message: Optional[str] = None,
        session_id: Optional[str] = None,
        summary: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        fields = []
        values: List[Any] = []

        if status is not None:
            fields.append("status = ?")
            values.append(status)
        if progress is not None:
            fields.append("progress = ?")
            values.append(max(0, min(100, int(progress))))
        if message is not None:
            fields.append("message = ?")
            values.append(message)
        if session_id is not None:
            fields.append("session_id = ?")
            values.append(session_id)
        if summary is not None:
            fields.append("summary_json = ?")
            values.append(json.dumps(summary, ensure_ascii=False))
        if error is not None:
            fields.append("error = ?")
            values.append(error)

        fields.append("updated_at = ?")
        values.append(self._now())
        values.append(job_id)

        with self._connect() as conn:
            conn.execute(
                f"UPDATE jobs SET {', '.join(fields)} WHERE job_id = ?",
                values,
            )

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["summary"] = json.loads(data["summary_json"]) if data.get("summary_json") else None
        data.pop("summary_json", None)
        return data

    def save_session(
        self,
        *,
        session_id: Optional[str] = None,
        file_type: str,
        records: List[Dict[str, Any]],
        summary: Dict[str, Any],
    ) -> str:
        session_id = session_id or uuid.uuid4().hex
        df = pd.DataFrame(records or [])
        columns = list(df.columns)
        dtypes = {col: str(df[col].dtype) for col in columns}
        profile = self._build_profile(df)

        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO sessions(
                    session_id, file_type, record_count, columns_json, dtypes_json,
                    profile_json, summary_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    file_type,
                    int(len(df)),
                    json.dumps(columns, ensure_ascii=False),
                    json.dumps(dtypes, ensure_ascii=False),
                    json.dumps(profile, ensure_ascii=False),
                    json.dumps(summary, ensure_ascii=False),
                    now,
                ),
            )

            if records:
                rows_to_insert = [
                    (session_id, idx, json.dumps(row, ensure_ascii=False))
                    for idx, row in enumerate(records)
                ]
                conn.executemany(
                    "INSERT INTO session_rows(session_id, row_index, row_json) VALUES (?, ?, ?)",
                    rows_to_insert,
                )

        return session_id

    def get_session_meta(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["columns"] = json.loads(data.get("columns_json") or "[]")
        data["dtypes"] = json.loads(data.get("dtypes_json") or "{}")
        data["profile"] = json.loads(data.get("profile_json") or "{}")
        data["summary"] = json.loads(data.get("summary_json") or "{}")
        data["insights"] = json.loads(data.get("insights_json") or "[]") if data.get("insights_json") else []
        for key in ["columns_json", "dtypes_json", "profile_json", "summary_json", "insights_json"]:
            data.pop(key, None)
        return data

    def get_session_page(self, session_id: str, page: int, limit: int) -> Dict[str, Any]:
        safe_page = max(1, int(page))
        safe_limit = max(1, min(500, int(limit)))
        offset = (safe_page - 1) * safe_limit

        with self._connect() as conn:
            total = conn.execute(
                "SELECT COUNT(*) AS c FROM session_rows WHERE session_id = ?",
                (session_id,),
            ).fetchone()["c"]
            rows = conn.execute(
                """
                SELECT row_json FROM session_rows
                WHERE session_id = ?
                ORDER BY row_index ASC
                LIMIT ? OFFSET ?
                """,
                (session_id, safe_limit, offset),
            ).fetchall()

        return {
            "page": safe_page,
            "limit": safe_limit,
            "total_records": int(total),
            "rows": [json.loads(r["row_json"]) for r in rows],
        }

    def get_session_rows(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        query = "SELECT row_json FROM session_rows WHERE session_id = ? ORDER BY row_index ASC"
        params: Tuple[Any, ...] = (session_id,)
        if limit is not None:
            query += " LIMIT ?"
            params = (session_id, int(limit))

        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [json.loads(r["row_json"]) for r in rows]

    def set_insights(self, session_id: str, insights: List[str]) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET insights_json = ? WHERE session_id = ?",
                (json.dumps(insights, ensure_ascii=False), session_id),
            )

    def execute_sql_on_session(
        self,
        *,
        session_id: str,
        sql: str,
        limit: int = 200,
    ) -> Dict[str, Any]:
        meta = self.get_session_meta(session_id)
        if not meta:
            raise ValueError("Session not found")

        columns: List[str] = meta.get("columns", [])
        dtypes: Dict[str, str] = meta.get("dtypes", {})
        if not columns:
            return {"rows": [], "columns": []}

        select_exprs = [self._json_extract_expr(col, dtypes.get(col, "object")) for col in columns]
        cte = (
            "SELECT "
            + ", ".join(select_exprs)
            + " FROM session_rows WHERE session_id = :session_id"
        )

        safe_sql = sql.strip()
        if "limit" not in safe_sql.lower():
            safe_sql += f" LIMIT {max(1, min(2000, int(limit)))}"

        final_sql = f"WITH dataset AS ({cte}) {safe_sql}"

        with self._connect() as conn:
            cursor = conn.execute(final_sql, {"session_id": session_id})
            rows = [dict(row) for row in cursor.fetchall()]
            out_columns = [col[0] for col in (cursor.description or [])]

        return {
            "rows": rows,
            "columns": out_columns,
        }

    def _json_extract_expr(self, column: str, dtype: str) -> str:
        escaped_column = column.replace('"', '""')
        json_path = '$."' + column.replace('"', '\\"') + '"'

        dtype_l = (dtype or "object").lower()
        if "int" in dtype_l or "float" in dtype_l or "double" in dtype_l or "decimal" in dtype_l:
            cast_type = "REAL"
        elif "bool" in dtype_l:
            cast_type = "INTEGER"
        else:
            cast_type = "TEXT"

        return f"CAST(json_extract(row_json, '{json_path}') AS {cast_type}) AS \"{escaped_column}\""

    def _build_profile(self, df: pd.DataFrame) -> Dict[str, Any]:
        profile: Dict[str, Any] = {
            "rowCount": int(len(df)),
            "columnCount": int(len(df.columns)),
            "columns": list(df.columns),
        }

        if df.empty:
            profile["nullCounts"] = {}
            profile["numericStats"] = {}
            profile["topCategoricalValues"] = {}
            return profile

        normalized = df.copy()
        normalized = normalized.where(pd.notna(normalized), None)

        profile["nullCounts"] = {
            col: int(normalized[col].isna().sum())
            for col in normalized.columns
        }

        numeric_cols = normalized.select_dtypes(include=["number"]).columns.tolist()
        if numeric_cols:
            stats_df = normalized[numeric_cols].describe().fillna(0)
            profile["numericStats"] = {
                stat: {col: self._clean_scalar(val) for col, val in cols.items()}
                for stat, cols in stats_df.to_dict(orient="index").items()
            }
        else:
            profile["numericStats"] = {}

        top_values: Dict[str, List[str]] = {}
        for col in normalized.columns:
            if col in numeric_cols:
                continue
            top_values[col] = (
                normalized[col]
                .dropna()
                .astype(str)
                .value_counts()
                .head(10)
                .index.tolist()
            )
        profile["topCategoricalValues"] = top_values

        return profile

    @staticmethod
    def _clean_scalar(value: Any) -> Any:
        if value is None:
            return None
        try:
            if pd.isna(value):
                return None
        except Exception:  # noqa: BLE001
            pass
        if hasattr(value, "item"):
            try:
                return value.item()
            except Exception:  # noqa: BLE001
                return str(value)
        return value
