#!/usr/bin/env python3
"""Test script to verify new API key works"""

import os
from dotenv import load_dotenv
from services.ai_mapper import GeminiAIMapper

def test_api_key():
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        print("ERROR: GEMINI_API_KEY not found in .env file")
        return False
    
    print(f"Testing API key: {api_key[:8]}...")
    
    try:
        mapper = GeminiAIMapper(gemini_api_key=api_key)
        # Simple test request
        test_payload = {
            "task": "test",
            "message": "Hello, this is a test"
        }
        response = mapper.request_json(test_payload)
        print("SUCCESS: API key is working!")
        return True
    except Exception as e:
        print(f"ERROR: API key test failed - {e}")
        return False

if __name__ == "__main__":
    test_api_key()
