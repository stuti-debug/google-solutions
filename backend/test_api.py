#!/usr/bin/env python3
"""Test script to verify Vertex AI and Gemini mapping configuration"""

import os
from dotenv import load_dotenv
from services.ai_mapper import GeminiAIMapper

def test_vertex_ai_config():
    load_dotenv()
    project_id = os.getenv("GCP_PROJECT_ID")
    
    if not project_id:
        print("ERROR: GCP_PROJECT_ID not found in .env file")
        return False
    
    print(f"Testing Vertex AI with GCP Project: {project_id}...")
    
    try:
        mapper = GeminiAIMapper()
        # Simple test request
        test_payload = {
            "task": "test",
            "message": "Hello, this is a test"
        }
        response = mapper.request_json(test_payload)
        print("SUCCESS: Vertex AI and Gemini mapping are working!")
        return True
    except Exception as e:
        print(f"ERROR: Vertex AI test failed - {e}")
        return False

if __name__ == "__main__":
    test_vertex_ai_config()
