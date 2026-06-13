import json
import os
import random
import re
import time
import concurrent.futures
from typing import Any, Dict, List, Optional

import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

from config import get_settings


class AIMapperError(Exception):
    pass


class QuotaExhaustedError(AIMapperError):
    pass


class GeminiAIMapper:
    def __init__(
        self,
        gcp_project_id: Optional[str] = None,
        gcp_location: Optional[str] = None,
        model_name: Optional[str] = None,
        retries: Optional[int] = None,
    ):
        settings = get_settings(strict=gcp_project_id is None)
        project_id = gcp_project_id or settings.gcp_project_id
        location = gcp_location or settings.gcp_location

        if not project_id:
            raise ValueError("GCP_PROJECT_ID is not set. Please configure it in a .env file.")

        # Resolve GOOGLE_APPLICATION_CREDENTIALS to an absolute path if it is set or fallback
        sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY_PATH") or "./firebase-credentials.json"
        if sa_path:
            if not os.path.isabs(sa_path):
                # Check CWD
                if os.path.exists(sa_path):
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(sa_path)
                else:
                    # Try relative to the backend base folder
                    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                    possible_path = os.path.join(backend_dir, sa_path)
                    if os.path.exists(possible_path):
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = possible_path
            else:
                if os.path.exists(sa_path):
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = sa_path

        # Initialize Vertex AI SDK
        vertexai.init(project=project_id, location=location)

        self.model_name = model_name or settings.gemini_model or "gemini-3.5-flash"
        self.retries = settings.gemini_json_retries if retries is None else max(0, retries)
        self.model_name = self.model_name.replace("models/", "").strip()

        # Create the GenerativeModel instance
        self.model = GenerativeModel(self.model_name)

    def request_json(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._request_json(payload)

    def generate_text(self, prompt: str, temperature: float = 0.1) -> str:
        last_error = None
        max_retries = self.retries

        for attempt in range(max_retries + 1):
            try:
                executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
                try:
                    future = executor.submit(
                        self.model.generate_content,
                        prompt,
                        generation_config=GenerationConfig(temperature=temperature),
                    )
                    try:
                        response = future.result(timeout=15.0)
                        return self._extract_text(response)
                    except concurrent.futures.TimeoutError:
                        raise AIMapperError("LLM pipeline exceeded 15 seconds timeout. Fallback to manual mapping required.")
                finally:
                    executor.shutdown(wait=False)
            except Exception as exc:
                err_str = str(exc)
                is_quota = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                if is_quota and attempt == max_retries:
                    raise QuotaExhaustedError(f"Gemini API quota exhausted: {err_str}") from exc
                if not is_quota:
                    raise exc
                last_error = exc
                if attempt < max_retries:
                    time.sleep(self._retry_delay_seconds(attempt))

        raise AIMapperError(f"Gemini text generation failed: {last_error}")

    def classify_file_type(self, input_columns: List[str], sample_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        payload = {
            "task": "classify_disaster_relief_table_type",
            "allowed_types": ["beneficiary", "inventory", "donor"],
            "input_columns": input_columns,
            "sample_rows": sample_rows,
            "instructions": [
                "Return strict JSON only",
                "Pick exactly one allowed type",
                "No markdown",
            ],
            "output_schema": {"file_type": "beneficiary|inventory|donor", "reason": "short"},
        }
        return self._request_json(payload)

    def map_columns(
        self,
        file_type: str,
        canonical_schema: List[str],
        required_fields: List[str],
        input_columns: List[str],
        sample_rows: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        payload = {
            "task": "map_input_columns_to_canonical_schema",
            "file_type": file_type,
            "canonical_schema": canonical_schema,
            "required_fields": required_fields,
            "input_columns": input_columns,
            "sample_rows": sample_rows,
            "rules": [
                "Map each input column to at most one canonical field",
                "Do not hallucinate input columns",
                "Use null when no good mapping exists",
                "Return strict JSON only",
            ],
            "output_schema": {
                "column_mapping": {"input_column": "canonical_field_or_null"},
                "drop_columns": ["input_column"],
                "date_columns": ["canonical_field"],
                "numeric_columns": ["canonical_field"],
                "district_columns": ["canonical_field"],
            },
        }
        return self._request_json(payload)

    def canonicalize_districts(self, values: List[str]) -> Dict[str, Any]:
        payload = {
            "task": "canonicalize_indian_district_names",
            "input_values": values,
            "rules": [
                "Map abbreviations/typos to canonical district name in Title Case",
                "Keep unknown values unchanged",
                "Return strict JSON only",
            ],
            "output_schema": {"mapping": {"input_value": "Canonical Value"}},
        }
        return self._request_json(payload)

    def _request_json(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        base_prompt = (
            "You are a strict JSON engine for NGO disaster datasets.\n"
            "Return only valid minified JSON. No markdown. No prose.\n"
            f"INPUT:\n{json.dumps(payload, ensure_ascii=False)}"
        )

        last_error: Optional[Exception] = None
        max_retries = self.retries

        for attempt in range(max_retries + 1):
            prompt = base_prompt
            if attempt > 0:
                prompt += (
                    "\nPrevious response was invalid JSON. "
                    "Return ONLY one valid JSON object matching the schema."
                )
            try:
                executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
                try:
                    future = executor.submit(
                        self.model.generate_content,
                        prompt,
                        generation_config=GenerationConfig(
                            temperature=0,
                            response_mime_type="application/json",
                        ),
                    )
                    try:
                        response = future.result(timeout=15.0)
                        text = self._extract_text(response)
                        return self._parse_json(text)
                    except concurrent.futures.TimeoutError:
                        raise AIMapperError("LLM pipeline exceeded 15 seconds timeout. Fallback to manual mapping required.")
                finally:
                    executor.shutdown(wait=False)
            except Exception as exc:  # noqa: BLE001
                err_str = str(exc)
                last_error = exc
                is_quota = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str

                if is_quota and attempt == max_retries:
                    raise QuotaExhaustedError(f"Gemini API quota exhausted: {err_str}") from exc
                if not is_quota:
                    raise exc
                if attempt < max_retries:
                    time.sleep(self._retry_delay_seconds(attempt))

        raise AIMapperError(f"Gemini JSON response parsing failed after retries: {last_error}")

    def _extract_text(self, response: Any) -> str:
        text = (getattr(response, "text", "") or "").strip()
        if text:
            return text

        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            if not content:
                continue
            parts = getattr(content, "parts", None) or []
            for part in parts:
                part_text = getattr(part, "text", None)
                if isinstance(part_text, str) and part_text.strip():
                    return part_text.strip()

        raise AIMapperError("Empty response from Gemini")

    def _parse_json(self, raw: str) -> Dict[str, Any]:
        # Strip markdown code fences (Gemini sometimes wraps each object in its own fence)
        cleaned = raw.strip()
        cleaned = re.sub(r"^```json\s*|^```\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.MULTILINE)
        cleaned = cleaned.strip()

        # --- Tier 1: direct parse (happy path) ---
        extra_data = False
        try:
            parsed = json.loads(cleaned)
            if not isinstance(parsed, dict):
                raise AIMapperError("Gemini response JSON is not an object")
            return parsed
        except json.JSONDecodeError as exc:
            extra_data = "Extra data" in str(exc)

        # --- Tier 2: "Extra data" — Gemini returned TWO objects; take the first ---
        if extra_data:
            start = cleaned.find("{")
            if start != -1:
                try:
                    parsed, _ = json.JSONDecoder().raw_decode(cleaned, start)
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    pass

        # --- Tier 3: non-greedy regex to extract the first {...} block ---
        match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
        if not match:
            match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                parsed, _ = json.JSONDecoder().raw_decode(match.group(0))
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

        raise AIMapperError(f"Could not extract a valid JSON object from Gemini response: {cleaned[:200]!r}")

    def _retry_delay_seconds(self, attempt: int) -> float:
        base = 0.75 * (2 ** attempt)
        jitter = random.uniform(0.0, 0.25)
        return min(4.0, base + jitter)
