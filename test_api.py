#!/usr/bin/env python3
"""Test script to verify Vertex AI connection works"""

import os
from dotenv import load_dotenv
from services.ai_mapper import GeminiAIMapper

def test_vertex_ai():
    load_dotenv()
    project_id = os.getenv("GCP_PROJECT_ID")
    location = os.getenv("GCP_LOCATION", "us-central1")

    if not project_id:
        print("ERROR: GCP_PROJECT_ID not found in .env file")
        return False

    print(f"Testing Vertex AI with project: {project_id}, location: {location}")

    try:
        mapper = GeminiAIMapper(gcp_project_id=project_id, gcp_location=location)
        # Simple test request
        test_payload = {
            "task": "test",
            "message": "Hello, this is a test"
        }
        response = mapper.request_json(test_payload)
        print("SUCCESS: Vertex AI connection is working!")
        return True
    except Exception as e:
        print(f"ERROR: Vertex AI test failed - {e}")
        return False

if __name__ == "__main__":
    test_vertex_ai()
