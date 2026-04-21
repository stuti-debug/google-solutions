import io
import json
import math
import os
import re
import threading
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

import concurrent.futures
import pandas as pd
from pydantic import BaseModel, Field, ValidationError

from services.ai_mapper import AIMapperError, GeminiAIMapper, QuotaExhaustedError


CANONICAL_SCHEMAS: Dict[str, List[str]] = {
    "beneficiary": [
        "beneficiary_id",
        "name",
        "gender",
        "phone",
        "district",
        "village",
        "household_size",
        "need_type",
        "date_registered",
    ],
    "inventory": [
        "item_id",
        "item_name",
        "category",
        "quantity",
        "unit",
        "district",
        "warehouse",
        "expiry_date",
        "last_updated",
    ],
    "donor": [
        "donor_id",
        "donor_name",
        "donor_type",
        "phone",
        "email",
        "district",
        "amount",
        "currency",
        "date_donated",
    ],
}

REQUIRED_FIELDS: Dict[str, List[str]] = {
    "beneficiary": ["name", "district", "village"],
    "inventory": ["item_name", "quantity"],
    "donor": ["donor_name"],
}

DATE_FIELDS: Dict[str, List[str]] = {
    "beneficiary": ["date_registered"],
    "inventory": ["expiry_date", "last_updated"],
    "donor": ["date_donated"],
}

NUMERIC_FIELDS: Dict[str, List[str]] = {
    "beneficiary": ["household_size"],
    "inventory": ["quantity"],
    "donor": ["amount"],
}

DEDUPE_KEYS: Dict[str, List[str]] = {
    "beneficiary": ["name", "phone", "district", "village"],
    "inventory": ["item_name", "district", "warehouse", "expiry_date"],
    "donor": ["donor_name", "phone", "email", "date_donated", "amount"],
}

COLUMN_ALIASES: Dict[str, Dict[str, str]] = {
    "beneficiary": {
        "beneficiaryname": "name",
        "nameofthebeneficiary": "name",
        "hhsize": "household_size",
        "familysize": "household_size",
        "regdate": "date_registered",
        "village_name": "village",
        "dist": "district",
    },
    "inventory": {
        "item": "item_name",
        "itemcode": "item_id",
        "qty": "quantity",
        "stock": "quantity",
        "godown": "warehouse",
        "lastupdate": "last_updated",
    },
    "donor": {
        "name": "donor_name",
        "donorname": "donor_name",
        "donationdate": "date_donated",
        "amountdonated": "amount",
        "mobileno": "phone",
    },
}

DISTRICT_LOCAL_MAP = {
    "lko": "Lucknow",
    "lucknow": "Lucknow",
    "knp": "Kanpur",
    "kanpur": "Kanpur",
    "vns": "Varanasi",
    "varanasi": "Varanasi",
    "allahabad": "Prayagraj",
    "pryagraj": "Prayagraj",
    "prayagraj": "Prayagraj",
}

NULL_TOKENS = {"", " ", "-", "na", "n/a", "null", "none", "nil", "nan"}

_GLOBAL_AI_CONCURRENCY = max(1, int(os.getenv("CRISISGRID_AI_GLOBAL_CONCURRENCY", "2")))
_GLOBAL_AI_SEMAPHORE = threading.BoundedSemaphore(_GLOBAL_AI_CONCURRENCY)


class ChunkMetadataSchema(BaseModel):
    totalFixed: int = Field(default=0, ge=0)
    removedDuplicates: int = Field(default=0, ge=0)
    droppedInvalidRows: int = Field(default=0, ge=0)


class ChunkResponseSchema(BaseModel):
    cleanedRows: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: ChunkMetadataSchema = Field(default_factory=ChunkMetadataSchema)


class CleaningPipelineError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        http_status: int = 400,
        details: Dict[str, Any] = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.details = details or {}


@dataclass
class CleaningSummary:
    total_fixed: int = 0
    removed_duplicates: int = 0
    dropped_invalid_rows: int = 0
    error_logs: List[Dict[str, Any]] = None

    def __post_init__(self) -> None:
        if self.error_logs is None:
            self.error_logs = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "totalFixed": self.total_fixed,
            "removedDuplicates": self.removed_duplicates,
            "droppedInvalidRows": self.dropped_invalid_rows,
            "error_logs": self.error_logs,
            "message": (
                f"Fixed {self.total_fixed} errors, removed {self.removed_duplicates} duplicates, "
                f"dropped {self.dropped_invalid_rows} invalid rows."
            ),
        }


class DataCleaner:
    def __init__(self, mapper: GeminiAIMapper, chunk_size: int = 50, ai_validation_retries: int = 2):
        self.mapper = mapper
        chunk_size_env = os.getenv("CRISISGRID_AI_CHUNK_SIZE")
        max_workers_env = os.getenv("CRISISGRID_AI_MAX_WORKERS")
        max_chunks_env = os.getenv("CRISISGRID_AI_MAX_CHUNKS_PER_FILE")
        chunk_timeout_env = os.getenv("CRISISGRID_AI_CHUNK_TIMEOUT_SECONDS")
        retries_env = os.getenv("CRISISGRID_AI_VALIDATION_RETRIES")

        effective_chunk_size = int(chunk_size_env) if chunk_size_env and chunk_size_env.isdigit() else chunk_size
        self.chunk_size = max(50, effective_chunk_size)

        effective_retries = int(retries_env) if retries_env and retries_env.isdigit() else ai_validation_retries
        self.ai_validation_retries = max(0, min(2, effective_retries))

        self.max_workers = max(1, int(max_workers_env)) if max_workers_env and max_workers_env.isdigit() else 2
        self.max_chunks_per_file = max(1, int(max_chunks_env)) if max_chunks_env and max_chunks_env.isdigit() else 4
        self.chunk_timeout_seconds = (
            max(15, int(chunk_timeout_env)) if chunk_timeout_env and chunk_timeout_env.isdigit() else 60
        )

    def process_file(
        self,
        filename: str,
        file_bytes: bytes,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Dict[str, Any]:
        summary = CleaningSummary()

        df = self._read_table(filename, file_bytes)
        if df.empty:
            raise CleaningPipelineError("EMPTY_FILE", "The uploaded file has no data rows.", 422)
        self._emit_progress(progress_callback, 10, "Loaded file")

        df = self._normalize_headers(df)
        df = self._normalize_null_tokens(df)
        self._emit_progress(progress_callback, 20, "Normalized headers and nulls")

        file_type = self._detect_file_type(df)
        mapping = self._get_column_mapping_from_gemini(df, file_type)
        df = self._apply_column_mapping(df, file_type, mapping)
        self._emit_progress(progress_callback, 30, "Mapped columns to canonical schema")

        ai_rows, ai_summary = self._clean_with_ai_chunks(df, file_type, progress_callback=progress_callback)
        summary.total_fixed += ai_summary.totalFixed
        summary.removed_duplicates += ai_summary.removedDuplicates
        summary.dropped_invalid_rows += ai_summary.droppedInvalidRows

        cleaned_df = pd.DataFrame(ai_rows)
        cleaned_df = self._apply_column_mapping(cleaned_df, file_type, {})
        self._emit_progress(progress_callback, 85, "Applied AI cleanup results")

        cleaned_df, district_fixes = self._normalize_districts(cleaned_df)
        cleaned_df, date_fixes = self._normalize_dates(cleaned_df, file_type)
        cleaned_df = self._normalize_numeric(cleaned_df, file_type)

        cleaned_df, dropped_invalid_rows, error_logs = self._drop_invalid_rows(cleaned_df, file_type)
        cleaned_df, removed_duplicates = self._remove_duplicates(cleaned_df, file_type)

        summary.total_fixed += district_fixes + date_fixes
        summary.removed_duplicates += removed_duplicates
        summary.dropped_invalid_rows += dropped_invalid_rows
        summary.error_logs.extend(error_logs)
        self._emit_progress(progress_callback, 95, "Final normalization and validation complete")

        docs = self._to_firestore_docs(cleaned_df)
        self._emit_progress(progress_callback, 100, "Cleaning complete")

        return {
            "status": "success",
            "fileType": file_type,
            "recordCount": len(docs),
            "cleanedDocuments": docs,
            "summary": summary.to_dict(),
        }

    def _clean_with_ai_chunks(
        self,
        df: pd.DataFrame,
        file_type: str,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Tuple[List[Dict[str, Any]], ChunkMetadataSchema]:
        records = df.where(pd.notna(df), None).to_dict(orient="records")
        if not records:
            return [], ChunkMetadataSchema()

        effective_chunk_size = self._effective_chunk_size(len(records))
        total_chunks = math.ceil(len(records) / effective_chunk_size)
        global_context = self._build_global_context(df, file_type)

        cleaned_rows_by_chunk: Dict[int, List[Dict[str, Any]]] = {}
        aggregate = ChunkMetadataSchema()

        chunk_ranges: Dict[int, Tuple[int, int]] = {
            idx: (idx * effective_chunk_size, min((idx + 1) * effective_chunk_size, len(records)))
            for idx in range(total_chunks)
        }

        def process_chunk(chunk_idx: int) -> ChunkResponseSchema:
            start, end = chunk_ranges[chunk_idx]
            with _GLOBAL_AI_SEMAPHORE:
                return self._clean_chunk_with_ai(
                    chunk_rows=records[start:end],
                    file_type=file_type,
                    global_context=global_context,
                    chunk_index=chunk_idx + 1,
                    total_chunks=total_chunks,
                )

        completed_chunks = 0
        max_workers = min(self.max_workers, total_chunks) if total_chunks > 0 else 1

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_idx = {executor.submit(process_chunk, i): i for i in range(total_chunks)}
            try:
                for future in concurrent.futures.as_completed(
                    future_to_idx,
                    timeout=max(30, self.chunk_timeout_seconds * max(total_chunks, 1)),
                ):
                    chunk_idx = future_to_idx[future]
                    start, end = chunk_ranges[chunk_idx]
                    try:
                        chunk_result = future.result()
                    except Exception:
                        fallback_rows = self._sanitize_ai_rows(records[start:end], file_type)
                        chunk_result = ChunkResponseSchema(
                            cleanedRows=fallback_rows,
                            metadata=ChunkMetadataSchema(totalFixed=0, removedDuplicates=0, droppedInvalidRows=0),
                        )

                    cleaned_rows_by_chunk[chunk_idx] = chunk_result.cleanedRows
                    aggregate.totalFixed += chunk_result.metadata.totalFixed
                    aggregate.removedDuplicates += chunk_result.metadata.removedDuplicates
                    aggregate.droppedInvalidRows += chunk_result.metadata.droppedInvalidRows

                    completed_chunks += 1
                    chunk_progress = 30 + int((completed_chunks / max(total_chunks, 1)) * 50)
                    self._emit_progress(
                        progress_callback,
                        chunk_progress,
                        f"Processed chunk {completed_chunks}/{total_chunks}",
                    )
            except concurrent.futures.TimeoutError:
                pass
            finally:
                for future, chunk_idx in future_to_idx.items():
                    if chunk_idx in cleaned_rows_by_chunk:
                        continue
                    future.cancel()
                    start, end = chunk_ranges[chunk_idx]
                    cleaned_rows_by_chunk[chunk_idx] = self._sanitize_ai_rows(records[start:end], file_type)

        cleaned_rows: List[Dict[str, Any]] = []
        for idx in range(total_chunks):
            cleaned_rows.extend(cleaned_rows_by_chunk.get(idx, []))

        return cleaned_rows, aggregate

    def _clean_chunk_with_ai(
        self,
        chunk_rows: List[Dict[str, Any]],
        file_type: str,
        global_context: Dict[str, Any],
        chunk_index: int,
        total_chunks: int,
    ) -> ChunkResponseSchema:
        schema_fields = CANONICAL_SCHEMAS[file_type]
        required_fields = REQUIRED_FIELDS[file_type]
        last_error: Optional[Exception] = None

        for attempt in range(self.ai_validation_retries + 1):
            payload = {
                "task": "entity_resolution_and_standardization",
                "file_type": file_type,
                "chunk_info": {
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks,
                    "chunk_row_count": len(chunk_rows),
                },
                "instructions": [
                    "Perform entity resolution and standardization across this chunk.",
                    "Treat short forms as same entities when context is clear (e.g., lko = Lucknow).",
                    "Fill missing values ONLY when high-confidence from row + dataset context; otherwise keep null.",
                    "Output each row with EXACTLY the canonical schema keys.",
                    "Return strict JSON only.",
                ],
                "canonical_schema": schema_fields,
                "required_fields": required_fields,
                "global_context": global_context,
                "rows": chunk_rows,
                "output_schema": {
                    "cleanedRows": [
                        {key: "value_or_null" for key in schema_fields}
                    ],
                    "metadata": {
                        "totalFixed": "int",
                        "removedDuplicates": "int",
                        "droppedInvalidRows": "int",
                    },
                },
            }
            if attempt > 0:
                payload["previous_error"] = str(last_error)

            try:
                data = self.mapper.request_json(payload)
                parsed = ChunkResponseSchema.model_validate(data)
                parsed.cleanedRows = self._sanitize_ai_rows(parsed.cleanedRows, file_type)
                return parsed
            except QuotaExhaustedError as err:
                last_error = err
                break
            except (AIMapperError, ValidationError, ValueError, TypeError) as err:
                last_error = err

        fallback_rows = self._sanitize_ai_rows(chunk_rows, file_type)
        return ChunkResponseSchema(
            cleanedRows=fallback_rows,
            metadata=ChunkMetadataSchema(totalFixed=0, removedDuplicates=0, droppedInvalidRows=0),
        )

    def _sanitize_ai_rows(self, rows: List[Dict[str, Any]], file_type: str) -> List[Dict[str, Any]]:
        allowed_keys = CANONICAL_SCHEMAS[file_type]
        sanitized: List[Dict[str, Any]] = []
        for row in rows:
            clean_row: Dict[str, Any] = {}
            for key in allowed_keys:
                value = row.get(key)
                if isinstance(value, str):
                    stripped = value.strip()
                    value = None if stripped.lower() in NULL_TOKENS else stripped
                clean_row[key] = value
            sanitized.append(clean_row)
        return sanitized

    def _build_global_context(self, df: pd.DataFrame, file_type: str) -> Dict[str, Any]:
        context: Dict[str, Any] = {
            "row_count": int(len(df)),
            "columns": list(df.columns),
            "canonical_schema": CANONICAL_SCHEMAS[file_type],
            "required_fields": REQUIRED_FIELDS[file_type],
        }

        if "district" in df.columns:
            district_values = df["district"].dropna().astype(str).str.strip()
            district_values = district_values[district_values != ""]
            context["district_candidates"] = district_values.value_counts().head(25).index.tolist()

        context["column_examples"] = {}
        for col in df.columns:
            non_null = df[col].dropna()
            if non_null.empty:
                continue
            context["column_examples"][col] = non_null.astype(str).head(5).tolist()

        return context

    def _read_table(self, filename: str, file_bytes: bytes) -> pd.DataFrame:
        if not file_bytes:
            raise CleaningPipelineError("EMPTY_UPLOAD", "Uploaded file is empty.", 400)

        lower = (filename or "").lower()
        bio = io.BytesIO(file_bytes)

        try:
            if lower.endswith(".csv"):
                return self._read_csv(bio)
            if lower.endswith(".xlsx") or lower.endswith(".xls"):
                return pd.read_excel(bio)

            try:
                bio.seek(0)
                return self._read_csv(bio)
            except Exception:
                bio.seek(0)
                return pd.read_excel(bio)
        except Exception as e:
            raise CleaningPipelineError(
                "UNREADABLE_FILE",
                "File could not be parsed. Upload valid CSV/XLS/XLSX.",
                422,
                {"error": str(e)},
            )

    def _read_csv(self, bio: io.BytesIO) -> pd.DataFrame:
        last_err = None
        for enc in ("utf-8-sig", "utf-8", "latin1"):
            try:
                bio.seek(0)
                return pd.read_csv(bio, encoding=enc)
            except Exception as e:  # noqa: PERF203
                last_err = e
        raise last_err

    def _normalize_headers(self, df: pd.DataFrame) -> pd.DataFrame:
        seen = {}
        new_cols = []
        for col in df.columns:
            base = re.sub(r"[^a-zA-Z0-9]+", "_", str(col).strip().lower()).strip("_")
            if not base:
                base = "column"
            if base in seen:
                seen[base] += 1
                base = f"{base}_{seen[base]}"
            else:
                seen[base] = 1
            new_cols.append(base)
        df.columns = new_cols
        return df

    def _normalize_null_tokens(self, df: pd.DataFrame) -> pd.DataFrame:
        def _clean_cell(value: Any) -> Any:
            if pd.isna(value):
                return pd.NA
            val = str(value).strip()
            return pd.NA if val.lower() in NULL_TOKENS else val

        return df.apply(lambda col: col.map(_clean_cell))

    def _detect_file_type(self, df: pd.DataFrame) -> str:
        cols = list(df.columns)

        def score(kind: str) -> int:
            schema = set(CANONICAL_SCHEMAS[kind])
            aliases = set(COLUMN_ALIASES[kind].keys())
            sc = 0
            for col in cols:
                compact = re.sub(r"[^a-z0-9]+", "", col.lower())
                if col in schema:
                    sc += 3
                if compact in aliases:
                    sc += 2
                if any(token in col for token in schema):
                    sc += 1
            return sc

        scores = {k: score(k) for k in CANONICAL_SCHEMAS.keys()}
        ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        if len(ordered) >= 2 and ordered[0][1] >= ordered[1][1] + 2:
            return ordered[0][0]

        try:
            data = self.mapper.classify_file_type(
                input_columns=list(df.columns),
                sample_rows=df.head(8).fillna("").to_dict(orient="records"),
            )
            file_type = data.get("file_type")
            if file_type in CANONICAL_SCHEMAS:
                return file_type
        except AIMapperError:
            pass

        return ordered[0][0] if ordered else "beneficiary"

    def _get_column_mapping_from_gemini(self, df: pd.DataFrame, file_type: str) -> Dict[str, str]:
        try:
            result = self.mapper.map_columns(
                file_type=file_type,
                canonical_schema=CANONICAL_SCHEMAS[file_type],
                required_fields=REQUIRED_FIELDS[file_type],
                input_columns=list(df.columns),
                sample_rows=df.head(20).fillna("").to_dict(orient="records"),
            )
        except AIMapperError:
            result = {"column_mapping": {}}

        raw_map = result.get("column_mapping", {})
        safe_map: Dict[str, str] = {}
        used_targets = set()

        for source, target in raw_map.items():
            if source in df.columns and target in CANONICAL_SCHEMAS[file_type] and target not in used_targets:
                safe_map[source] = target
                used_targets.add(target)

        alias_map = COLUMN_ALIASES[file_type]
        for col in df.columns:
            compact = re.sub(r"[^a-z0-9]+", "", col.lower())
            target = alias_map.get(compact)
            if col not in safe_map and target and target not in used_targets:
                safe_map[col] = target
                used_targets.add(target)

        return safe_map

    def _apply_column_mapping(self, df: pd.DataFrame, file_type: str, mapping: Dict[str, str]) -> pd.DataFrame:
        if mapping:
            df = df.rename(columns=mapping)
        wanted = CANONICAL_SCHEMAS[file_type]
        for col in wanted:
            if col not in df.columns:
                df[col] = pd.NA
        return df[wanted].copy()

    def _normalize_districts(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        if "district" not in df.columns:
            return df, 0

        fixed = 0
        unresolved = set()

        def local_map(value: Any) -> Any:
            nonlocal fixed
            if pd.isna(value):
                return pd.NA
            raw = str(value).strip()
            key = re.sub(r"[^a-z]", "", raw.lower())
            if key in DISTRICT_LOCAL_MAP:
                canonical = DISTRICT_LOCAL_MAP[key]
                if canonical != raw:
                    fixed += 1
                return canonical
            unresolved.add(raw)
            return raw

        df["district"] = df["district"].map(local_map)

        unresolved = {
            value
            for value in unresolved
            if value and re.sub(r"[^a-z]", "", value.lower()) not in DISTRICT_LOCAL_MAP
        }

        if unresolved:
            try:
                out = self.mapper.canonicalize_districts(sorted(unresolved))
                model_map = out.get("mapping", {})
            except AIMapperError:
                model_map = {}

            def gem_map(value: Any) -> Any:
                nonlocal fixed
                if pd.isna(value):
                    return value
                raw = str(value).strip()
                target = model_map.get(raw)
                if isinstance(target, str) and target.strip():
                    target = target.strip()
                    if target != raw:
                        fixed += 1
                    return target
                return raw

            df["district"] = df["district"].map(gem_map)

        return df, fixed

    def _normalize_dates(self, df: pd.DataFrame, file_type: str) -> Tuple[pd.DataFrame, int]:
        fixed = 0
        for col in DATE_FIELDS[file_type]:
            if col not in df.columns:
                continue
            original = df[col].copy()
            parsed = pd.to_datetime(df[col], errors="coerce", dayfirst=True, format="mixed")
            df[col] = parsed.dt.strftime("%Y-%m-%d")
            df.loc[parsed.isna(), col] = pd.NA
            changed = (
                original.fillna("").astype(str).str.strip()
                != df[col].fillna("").astype(str).str.strip()
            ).sum()
            fixed += int(changed)
        return df, fixed

    def _normalize_numeric(self, df: pd.DataFrame, file_type: str) -> pd.DataFrame:
        for col in NUMERIC_FIELDS[file_type]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")
        return df

    def _drop_invalid_rows(self, df: pd.DataFrame, file_type: str) -> Tuple[pd.DataFrame, int, List[Dict[str, Any]]]:
        required = [col for col in REQUIRED_FIELDS[file_type] if col in df.columns]
        if not required:
            return df, 0, []

        error_logs: List[Dict[str, Any]] = []
        invalid_mask = pd.Series(False, index=df.index)
        for idx in df.index:
            missing_fields = [col for col in required if pd.isna(df.at[idx, col])]
            if missing_fields:
                invalid_mask.at[idx] = True
                error_logs.append(
                    {
                        "row_index": int(idx),
                        "reason": f"Missing required fields: {', '.join(missing_fields)}",
                        "missing_fields": missing_fields,
                    }
                )

        dropped = int(invalid_mask.sum())
        return df.loc[~invalid_mask].copy(), dropped, error_logs

    def _remove_duplicates(self, df: pd.DataFrame, file_type: str) -> Tuple[pd.DataFrame, int]:
        keys = [k for k in DEDUPE_KEYS[file_type] if k in df.columns]
        before = len(df)
        df = df.drop_duplicates(subset=keys if keys else None, keep="first")
        return df, before - len(df)

    def _to_firestore_docs(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        df = df.where(pd.notna(df), None)
        docs = df.to_dict(orient="records")

        def cast(v: Any) -> Any:
            if isinstance(v, pd.Timestamp):
                return v.strftime("%Y-%m-%d")
            if hasattr(v, "item"):
                try:
                    return v.item()
                except Exception:  # noqa: BLE001
                    pass
            return v

        return [{k: cast(v) for k, v in row.items()} for row in docs]

    def _effective_chunk_size(self, total_records: int) -> int:
        if total_records <= self.chunk_size:
            return self.chunk_size
        adaptive = math.ceil(total_records / self.max_chunks_per_file)
        return max(self.chunk_size, adaptive)

    def _emit_progress(
        self,
        callback: Optional[Callable[[int, str], None]],
        progress: int,
        message: str,
    ) -> None:
        if callback is None:
            return
        safe_progress = max(0, min(100, int(progress)))
        try:
            callback(safe_progress, message)
        except Exception:
            pass


def to_json(data: Dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)
