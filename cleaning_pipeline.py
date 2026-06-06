import json
import sys
from typing import Any, Callable, Dict, Optional

from config import get_settings
from services.ai_mapper import GeminiAIMapper
from services.cleaner import CleaningPipelineError, DataCleaner


class CrisisGridCleaningPipeline:
    def __init__(
        self,
        gcp_project_id: Optional[str] = None,
        gcp_location: Optional[str] = None,
        model_name: str = "gemini-2.5-flash",
    ):
        settings = get_settings(strict=gcp_project_id is None)
        mapper = GeminiAIMapper(
            gcp_project_id=gcp_project_id or settings.gcp_project_id,
            gcp_location=gcp_location or settings.gcp_location,
            model_name=model_name,
        )
        self.cleaner = DataCleaner(mapper=mapper)

    def process_file(
        self,
        filename: str,
        file_bytes: bytes,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Dict[str, Any]:
        return self.cleaner.process_file(
            filename=filename,
            file_bytes=file_bytes,
            progress_callback=progress_callback,
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cleaning_pipeline.py <file_path>")
        raise SystemExit(1)

    file_path = sys.argv[1]
    with open(file_path, "rb") as f:
        raw = f.read()

    pipeline = CrisisGridCleaningPipeline()
    result = pipeline.process_file(filename=file_path, file_bytes=raw)
    print(json.dumps(result["summary"], indent=2))
    print(f"fileType={result['fileType']} recordCount={result['recordCount']}")