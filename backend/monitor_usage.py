#!/usr/bin/env python3
"""
Monitor Gemini API usage to prevent quota exhaustion
"""
import os
import time
from datetime import datetime
from typing import Dict, List
import json

class APIUsageMonitor:
    def __init__(self, log_file: str = "api_usage.log"):
        self.log_file = log_file
        self.daily_limit = 100  # Set your daily limit
        self.requests_today = 0
        self.load_usage_data()
    
    def load_usage_data(self):
        """Load today's usage data"""
        try:
            if os.path.exists(self.log_file):
                with open(self.log_file, 'r') as f:
                    data = json.load(f)
                    today = datetime.now().strftime("%Y-%m-%d")
                    if data.get("date") == today:
                        self.requests_today = data.get("requests", 0)
        except:
            self.requests_today = 0
    
    def save_usage_data(self):
        """Save usage data"""
        data = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "requests": self.requests_today,
            "last_updated": datetime.now().isoformat()
        }
        with open(self.log_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def log_request(self):
        """Log an API request"""
        self.requests_today += 1
        self.save_usage_data()
        
        if self.requests_today > self.daily_limit * 0.8:
            print(f"WARNING: {self.requests_today}/{self.daily_limit} requests used today!")
        
        if self.requests_today >= self.daily_limit:
            raise Exception("Daily API limit reached!")
    
    def get_usage_status(self) -> Dict:
        return {
            "requests_today": self.requests_today,
            "daily_limit": self.daily_limit,
            "remaining": self.daily_limit - self.requests_today,
            "percentage_used": (self.requests_today / self.daily_limit) * 100
        }

# Usage example
if __name__ == "__main__":
    monitor = APIUsageMonitor()
    print("Current usage:", monitor.get_usage_status())
