#!/usr/bin/env python3
"""Debug script to check backend API status"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

def test_backend():
    print("=== CrisisGrid Backend Debug ===")
    
    # Test 1: Check if server is running
    try:
        response = requests.get(f"{API_BASE}/", timeout=5)
        print(f"Server Status: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"Server not responding: {e}")
        return False
    
    # Test 2: Check API endpoints
    endpoints = [
        "/clean",
        "/status/test_job_123",
        "/data/test_session_123"
    ]
    
    for endpoint in endpoints:
        try:
            response = requests.get(f"{API_BASE}{endpoint}", timeout=5)
            print(f"GET {endpoint}: {response.status_code}")
        except Exception as e:
            print(f"GET {endpoint}: Error - {e}")
    
    # Test 3: Test with sample file
    try:
        with open("sample.csv", "rb") as f:
            files = {"file": ("sample.csv", f, "text/csv")}
            response = requests.post(f"{API_BASE}/clean", files=files, timeout=10)
            print(f"POST /clean: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                job_id = data.get("job_id")
                print(f"Job ID: {job_id}")
                
                # Test polling
                if job_id:
                    print("Testing polling...")
                    for i in range(10):
                        status_response = requests.get(f"{API_BASE}/status/{job_id}", timeout=5)
                        status_data = status_response.json()
                        print(f"  Attempt {i+1}: {status_data.get('status', 'unknown')}")
                        
                        if status_data.get("status") in ["completed", "failed"]:
                            break
                        time.sleep(2)
            else:
                print(f"Error response: {response.text}")
    except Exception as e:
        print(f"File upload test failed: {e}")
    
    return True

if __name__ == "__main__":
    test_backend()
