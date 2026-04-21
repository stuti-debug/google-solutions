import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    gemini_json_retries: int
    debug_key_prefix: bool


def get_settings(strict: bool = True) -> Settings:
    load_dotenv(override=True)

    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not gemini_api_key:
        gemini_api_key = os.getenv("GOOGLE_API_KEY", "").strip()

    if not gemini_api_key and strict:
        raise ValueError("GEMINI_API_KEY is not set. Please configure it in a .env file.")

    gemini_model = (os.getenv("GEMINI_MODEL", "gemini-1.5-flash") or "gemini-1.5-flash").strip()

    retries_raw = (os.getenv("GEMINI_JSON_RETRIES", "1") or "1").strip()
    try:
        gemini_json_retries = max(0, int(retries_raw))
    except ValueError:
        gemini_json_retries = 1

    debug_key_prefix = (os.getenv("DEBUG_GEMINI_KEY_PREFIX", "false").strip().lower() in {"1", "true", "yes", "on"})

    if debug_key_prefix and gemini_api_key:
        print("Using API key prefix:", gemini_api_key[:8])

    return Settings(
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
        gemini_json_retries=gemini_json_retries,
        debug_key_prefix=debug_key_prefix,
    )
