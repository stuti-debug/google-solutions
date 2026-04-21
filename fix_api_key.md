# API Key Recovery Guide

## Steps to Fix API Key Issues

### 1. Revoke Current API Key
1. Go to Google Cloud Console
2. APIs & Services > Credentials
3. Find your Gemini API key
4. Click "Delete" or "Revoke"

### 2. Create New API Key
1. Click "Create Credentials" > "API Key"
2. Restrict the key to Gemini API only
3. Set usage quotas if needed

### 3. Update Local Environment
```bash
# Edit .env file
GEMINI_API_KEY="your_new_api_key_here"

# Or set environment variable
export GEMINI_API_KEY="your_new_api_key_here"
```

### 4. Check for Leaks
```bash
# Search for old API key in code
grep -r "AIzaSyCNtWksNoGJ3J8PEt_S0iwc-O14VYQ3kdw" .
```

### 5. Test with Small Request
```python
# Test script
import os
from google.generativeai import configure, GenerativeModel

configure(api_key=os.getenv("GEMINI_API_KEY"))
model = GenerativeModel("gemini-1.5-flash")
response = model.generate_content("Hello")
print(response.text)
```

## Prevention Tips

1. **Never commit API keys to Git**
2. **Use environment variables only**
3. **Set API key restrictions**
4. **Monitor usage regularly**
5. **Use rate limiting in code**
