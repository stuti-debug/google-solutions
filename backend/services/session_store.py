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
                    file_type TEXT,
                    row_index INTEGER NOT NULL,
                    row_json TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
                )
                """
            )
            row_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(session_rows)").fetchall()
            }
            if "file_type" not in row_columns:
                conn.execute("ALTER TABLE session_rows ADD COLUMN file_type TEXT")
                
            jobs_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(jobs)").fetchall()
            }
            if "user_id" not in jobs_columns:
                conn.execute("ALTER TABLE jobs ADD COLUMN user_id TEXT")
                
            sessions_columns = {
                row["name"]
                for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
            }
            if "user_id" not in sessions_columns:
                conn.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT")
                
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session_rows_session ON session_rows(session_id, row_index)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_session_rows_type ON session_rows(session_id, file_type, row_index)")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS location_overrides (
                    session_id TEXT NOT NULL,
                    location_name TEXT NOT NULL,
                    lat REAL NOT NULL,
                    lng REAL NOT NULL,
                    PRIMARY KEY (session_id, location_name)
                )
                """
            )

    def save_location_override(self, session_id: str, location_name: str, lat: float, lng: float) -> None:
        """Save a manual coordinate override for a specific location in a session."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO location_overrides (session_id, location_name, lat, lng)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id, location_name) DO UPDATE SET lat=excluded.lat, lng=excluded.lng
                """,
                (session_id, location_name, lat, lng),
            )

    def get_location_overrides(self, session_id: str) -> Dict[str, Tuple[float, float]]:
        """Retrieve all location overrides for a given session."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT location_name, lat, lng FROM location_overrides WHERE session_id = ?",
                (session_id,)
            ).fetchall()
            return {row["location_name"]: (row["lat"], row["lng"]) for row in rows}

    def create_job(self, filename: str = "upload", user_id: Optional[str] = None) -> str:
        job_id = uuid.uuid4().hex
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs(job_id, status, progress, message, user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, "processing", 0, f"Received file: {filename}", user_id, now, now),
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
        user_id: Optional[str] = None,
        ) -> str:
        session_id = session_id or uuid.uuid4().hex
        incoming_records = records or []

        now = self._now()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO sessions(
                        session_id, file_type, record_count, columns_json, dtypes_json,
                        profile_json, summary_json, user_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        file_type or "unknown",
                        0,
                        "[]",
                        "{}",
                        json.dumps(self._build_profile(pd.DataFrame()), ensure_ascii=False),
                        json.dumps({}, ensure_ascii=False),
                        user_id,
                        now,
                    ),
                )
                existing = conn.execute(
                    "SELECT * FROM sessions WHERE session_id = ?",
                    (session_id,),
                ).fetchone()

            current_max = conn.execute(
                "SELECT COALESCE(MAX(row_index), -1) AS max_idx FROM session_rows WHERE session_id = ?",
                (session_id,),
            ).fetchone()["max_idx"]

            if incoming_records:
                rows_to_insert = [
                    (
                        session_id,
                        file_type,
                        int(current_max) + idx + 1,
                        json.dumps(row, ensure_ascii=False),
                    )
                    for idx, row in enumerate(incoming_records)
                ]
                conn.executemany(
                    "INSERT INTO session_rows(session_id, file_type, row_index, row_json) VALUES (?, ?, ?, ?)",
                    rows_to_insert,
                )

            all_rows = conn.execute(
                """
                SELECT file_type, row_json FROM session_rows
                WHERE session_id = ?
                ORDER BY row_index ASC
                """,
                (session_id,),
            ).fetchall()
            all_records = [json.loads(r["row_json"]) for r in all_rows]
            file_types = sorted({(r["file_type"] or file_type or "unknown") for r in all_rows}) or [file_type or "unknown"]
            df = pd.DataFrame(all_records)
            columns = list(df.columns)
            dtypes = {col: str(df[col].dtype) for col in columns}
            profile = self._build_profile(df)
            combined_summary = self._merge_summary(
                json.loads(existing["summary_json"]) if existing and existing["summary_json"] else {},
                summary or {},
            )
            combined_summary["fileTypes"] = file_types
            combined_summary["recordCountsByType"] = self._count_rows_by_type(conn, session_id)
            session_file_type = file_types[0] if len(file_types) == 1 else "multiple"

            if existing:
                conn.execute(
                    """
                    UPDATE sessions
                    SET file_type = ?, record_count = ?, columns_json = ?, dtypes_json = ?,
                        profile_json = ?, summary_json = ?
                    WHERE session_id = ?
                    """,
                    (
                        session_file_type,
                        int(len(df)),
                        json.dumps(columns, ensure_ascii=False),
                        json.dumps(dtypes, ensure_ascii=False),
                        json.dumps(profile, ensure_ascii=False),
                        json.dumps(combined_summary, ensure_ascii=False),
                        session_id,
                    ),
                )
        
        # Sync metadata to Cloud Firestore for real-time multiplayer coordination updates
        try:
            from core.firebase import get_db
            db = get_db()
            db.collection("sessions").document(session_id).set({
                "session_id": session_id,
                "file_type": session_file_type,
                "record_count": int(len(df)),
                "columns": columns,
                "dtypes": dtypes,
                "profile": profile,
                "summary": combined_summary,
                "updated_at": now
            }, merge=True)
        except Exception as fe:
            print(f"Firestore session sync failed: {fe}")

        return session_id

    def update_session_row(self, session_id: str, row_index: int, updated_row: dict) -> bool:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT file_type, row_json FROM session_rows WHERE session_id = ? AND row_index = ?",
                (session_id, row_index)
            ).fetchone()
            if not existing:
                return False

            current_row = json.loads(existing["row_json"])
            # Remove any internal fields from incoming updated_row to keep data clean
            for k in list(updated_row.keys()):
                if k.startswith("_") or k == "row_index" or k == "session_id" or k == "file_type":
                    updated_row.pop(k, None)

            current_row.update(updated_row)

            # Update SQLite
            conn.execute(
                "UPDATE session_rows SET row_json = ? WHERE session_id = ? AND row_index = ?",
                (json.dumps(current_row, ensure_ascii=False), session_id, row_index)
            )

            # Recalculate metadata
            all_rows = conn.execute(
                """
                SELECT file_type, row_json FROM session_rows
                WHERE session_id = ?
                ORDER BY row_index ASC
                """,
                (session_id,),
            ).fetchall()

            all_records = [json.loads(r["row_json"]) for r in all_rows]
            file_types = sorted({(r["file_type"] or "unknown") for r in all_rows}) or ["unknown"]
            df = pd.DataFrame(all_records)
            columns = list(df.columns)
            dtypes = {col: str(df[col].dtype) for col in columns}
            profile = self._build_profile(df)

            session_meta = conn.execute(
                "SELECT summary_json FROM sessions WHERE session_id = ?",
                (session_id,)
            ).fetchone()
            existing_summary = json.loads(session_meta["summary_json"]) if session_meta and session_meta["summary_json"] else {}
            record_counts_by_type = self._count_rows_by_type(conn, session_id)
            existing_summary["recordCountsByType"] = record_counts_by_type
            existing_summary["fileTypes"] = file_types

            session_file_type = file_types[0] if len(file_types) == 1 else "multiple"

            conn.execute(
                """
                UPDATE sessions
                SET file_type = ?, record_count = ?, columns_json = ?, dtypes_json = ?,
                    profile_json = ?, summary_json = ?
                WHERE session_id = ?
                """,
                (
                    session_file_type,
                    int(len(df)),
                    json.dumps(columns, ensure_ascii=False),
                    json.dumps(dtypes, ensure_ascii=False),
                    json.dumps(profile, ensure_ascii=False),
                    json.dumps(existing_summary, ensure_ascii=False),
                    session_id,
                ),
            )

        # Sync update to Cloud Firestore
        now = self._now()
        try:
            from core.firebase import get_db
            db = get_db()
            if db is not None:
                # 1. Update the row doc in the target collection
                normalized_type = str(existing["file_type"] or "unknown").lower().strip()
                target_collection = "beneficiaries"
                if normalized_type in {"inventory", "inventories"}:
                    target_collection = "inventory"
                elif normalized_type in {"donor", "donors"}:
                    target_collection = "donors"

                docs = db.collection(target_collection).where("session_id", "==", session_id).where("row_index", "==", row_index).limit(1).stream()
                doc_found = False
                from firebase_admin import firestore
                for doc in docs:
                    doc_found = True
                    payload = dict(current_row or {})
                    payload["session_id"] = session_id
                    payload["file_type"] = existing["file_type"]
                    payload["row_index"] = row_index
                    payload["synced_at"] = firestore.SERVER_TIMESTAMP
                    db.collection(target_collection).document(doc.id).set(payload, merge=True)

                if not doc_found:
                    doc_ref = db.collection(target_collection).document()
                    payload = dict(current_row or {})
                    payload["session_id"] = session_id
                    payload["file_type"] = existing["file_type"]
                    payload["row_index"] = row_index
                    payload["synced_at"] = firestore.SERVER_TIMESTAMP
                    doc_ref.set(payload)

                # 2. Update the session metadata doc in firestore to trigger real-time updates for other users
                db.collection("sessions").document(session_id).set({
                    "session_id": session_id,
                    "file_type": session_file_type,
                    "record_count": int(len(df)),
                    "columns": columns,
                    "dtypes": dtypes,
                    "profile": profile,
                    "summary": existing_summary,
                    "updated_at": now
                }, merge=True)
        except Exception as fe:
            print(f"Firestore session row sync failed: {fe}")

        return True

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

    def get_session_page(
        self,
        session_id: str,
        page: int,
        limit: int,
        file_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        safe_page = max(1, int(page))
        safe_limit = max(1, min(500, int(limit)))
        offset = (safe_page - 1) * safe_limit
        normalized_type = (file_type or "").lower().strip() or None

        where_clause = "WHERE session_id = ?"
        params: List[Any] = [session_id]
        if normalized_type and normalized_type != "all":
            where_clause += " AND file_type = ?"
            params.append(normalized_type)

        with self._connect() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) AS c FROM session_rows {where_clause}",
                params,
            ).fetchone()["c"]
            rows = conn.execute(
                f"""
                SELECT file_type, row_index, row_json FROM session_rows
                {where_clause}
                ORDER BY row_index ASC
                LIMIT ? OFFSET ?
                """,
                [*params, safe_limit, offset],
            ).fetchall()

        return {
            "page": safe_page,
            "limit": safe_limit,
            "total_records": int(total),
            "file_type": normalized_type or "all",
            "rows": [
                {
                    **json.loads(r["row_json"]),
                    "_file_type": r["file_type"],
                    "_row_index": r["row_index"],
                }
                for r in rows
            ],
        }

    def get_session_rows(
        self,
        session_id: str,
        limit: Optional[int] = None,
        file_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        query = "SELECT file_type, row_index, row_json FROM session_rows WHERE session_id = ?"
        params_list: List[Any] = [session_id]
        normalized_type = (file_type or "").lower().strip()
        if normalized_type and normalized_type != "all":
            query += " AND file_type = ?"
            params_list.append(normalized_type)
        query += " ORDER BY row_index ASC"
        if limit is not None:
            query += " LIMIT ?"
            params_list.append(int(limit))

        with self._connect() as conn:
            rows = conn.execute(query, tuple(params_list)).fetchall()
            
        result = [
            {
                **json.loads(r["row_json"]),
                "_file_type": r["file_type"],
                "_row_index": r["row_index"],
            }
            for r in rows
        ]
        
        if not result:
            try:
                from routes.data import _get_firestore_session_page
                fs_data = _get_firestore_session_page(session_id, normalized_type or "all", 1, limit or 500)
                result = fs_data.get("rows", [])
            except ImportError:
                pass
                
        return result

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

    def _count_rows_by_type(self, conn: sqlite3.Connection, session_id: str) -> Dict[str, int]:
        rows = conn.execute(
            """
            SELECT COALESCE(file_type, 'unknown') AS file_type, COUNT(*) AS count
            FROM session_rows
            WHERE session_id = ?
            GROUP BY COALESCE(file_type, 'unknown')
            """,
            (session_id,),
        ).fetchall()
        return {row["file_type"]: int(row["count"]) for row in rows}

    def _merge_summary(self, current: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(current or {})
        for key in ["totalFixed", "removedDuplicates", "droppedInvalidRows"]:
            merged[key] = int(merged.get(key) or 0) + int((incoming or {}).get(key) or 0)

        current_logs = merged.get("error_logs") or []
        incoming_logs = (incoming or {}).get("error_logs") or []
        merged["error_logs"] = [*current_logs, *incoming_logs]
        merged["message"] = (
            f"Fixed {merged.get('totalFixed', 0)} errors, "
            f"removed {merged.get('removedDuplicates', 0)} duplicates, "
            f"dropped {merged.get('droppedInvalidRows', 0)} invalid rows."
        )
        return merged

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
