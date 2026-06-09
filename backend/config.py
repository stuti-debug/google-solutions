import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    gcp_project_id: str
    gcp_location: str
    gemini_model: str
    gemini_json_retries: int
    debug_key_prefix: bool


def get_settings(strict: bool = True) -> Settings:
    load_dotenv(override=True)

    gcp_project_id = os.getenv("GCP_PROJECT_ID", "").strip()
    if not gcp_project_id and strict:
        raise ValueError("GCP_PROJECT_ID is not set. Please configure it in a .env file.")

    gcp_location = os.getenv("GCP_LOCATION", "global").strip()

    gemini_model = (os.getenv("GEMINI_MODEL", "gemini-3.5-flash") or "gemini-3.5-flash").strip()

    retries_raw = (os.getenv("GEMINI_JSON_RETRIES", "1") or "1").strip()
    try:
        gemini_json_retries = max(0, int(retries_raw))
    except ValueError:
        gemini_json_retries = 1

    debug_key_prefix = (os.getenv("DEBUG_GEMINI_KEY_PREFIX", "false").strip().lower() in {"1", "true", "yes", "on"})

    if debug_key_prefix and gcp_project_id:
        print("Using GCP project:", gcp_project_id)

    return Settings(
        gcp_project_id=gcp_project_id,
        gcp_location=gcp_location,
        gemini_model=gemini_model,
        gemini_json_retries=gemini_json_retries,
        debug_key_prefix=debug_key_prefix,
    )
