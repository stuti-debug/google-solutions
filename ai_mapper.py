import json
import re
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from config import get_settings


class AIMapperError(Exception):
    pass


class GeminiAIMapper:
    def __init__(
        self,
        gemini_api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        retries: Optional[int] = None,
    ):
        settings = get_settings(strict=gemini_api_key is None)
        api_key = gemini_api_key or settings.gemini_api_key
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set. Please configure it in a .env file.")

        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name or settings.gemini_model or "gemini-1.5-flash"
        self.retries = settings.gemini_json_retries if retries is None else max(0, retries)
        self.model_name = self._resolve_model_name(self.model_name)

    def request_json(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return self._request_json(payload)

    def generate_text(self, prompt: str, temperature: float = 0.1) -> str:
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=temperature),
        )
        return self._extract_text(response)

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
        for attempt in range(self.retries + 1):
            prompt = base_prompt
            if attempt > 0:
                prompt += (
                    "\nPrevious response was invalid JSON. "
                    "Return ONLY one valid JSON object matching the schema."
                )
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0,
                        response_mime_type="application/json",
                    ),
                )
                text = self._extract_text(response)
                return self._parse_json(text)
            except Exception as exc:  # noqa: BLE001
                if "NOT_FOUND" in str(exc) and attempt == 0:
                    self.model_name = self._resolve_model_name(self.model_name)
                last_error = exc

        raise AIMapperError(f"Gemini JSON response parsing failed after retries: {last_error}")

    def _resolve_model_name(self, requested: str) -> str:
        requested_clean = requested.replace("models/", "").strip()

        try:
            available = [model.name for model in self.client.models.list()]
        except Exception:
            return requested_clean

        available_clean = {name.replace("models/", ""): name for name in available}
        if requested_clean in available_clean:
            return available_clean[requested_clean]

        fallback_order = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-001",
            "gemini-2.0-flash-lite",
            "gemini-2.5-flash",
        ]
        for candidate in fallback_order:
            if candidate in available_clean:
                return available_clean[candidate]

        return requested_clean

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
        cleaned = raw.strip()
        cleaned = re.sub(r"^```json\s*|^```\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)

        try:
            parsed = json.loads(cleaned)
            if not isinstance(parsed, dict):
                raise AIMapperError("Gemini response JSON is not an object")
            return parsed
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]*\}", cleaned)
            if not match:
                raise
            parsed = json.loads(match.group(0))
            if not isinstance(parsed, dict):
                raise AIMapperError("Gemini response JSON is not an object")
            return parsed
