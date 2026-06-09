import os
from concurrent.futures import ThreadPoolExecutor
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from services.session_store import SessionStore
from cleaning_pipeline import CrisisGridCleaningPipeline

# Global services initialized once
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri="memory://",
)

store = SessionStore()
CLEAN_JOB_EXECUTOR = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("CRISISGRID_JOB_WORKERS", "2"))),
    thread_name_prefix="crisisgrid-clean-job",
)
PIPELINE = CrisisGridCleaningPipeline()
