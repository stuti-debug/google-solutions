# CrisisGrid Team Setup Guide

## For Team Members: How to Clone & Setup CrisisGrid Project

### Prerequisites
- Git installed on your PC
- Python 3.8+ installed
- Google Gemini API key
- Code editor (VS Code recommended)

---

## Step 1: Clone the Repository

### Option A: Using HTTPS (Recommended)
```bash
git clone https://github.com/yourusername/crisisgrid.git
cd crisisgrid
```

### Option B: Using SSH (If you have SSH keys setup)
```bash
git clone git@github.com:yourusername/crisisgrid.git
cd crisisgrid
```

---

## Step 2: Setup Python Environment

### Create Virtual Environment
```bash
# For Windows
python -m venv venv
venv\Scripts\activate

# For Mac/Linux
python3 -m venv venv
source venv/bin/activate
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

---

## Step 3: Configure Environment Variables

### Create .env file
```bash
cp .env.example .env
```

### Edit .env file
```bash
# Open .env in your text editor and add:
GEMINI_API_KEY=your_personal_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
GEMINI_JSON_RETRIES=2
DEBUG_GEMINI_KEY_PREFIX=false
```

**IMPORTANT**: Each team member must use their OWN Gemini API key. Never share API keys!

---

## Step 4: Test the Setup

### Run Test Script
```bash
python test_api.py
```

### Run Sample Data Test
```bash
python cleaning_pipeline.py sample.csv
```

### Start Web Application (Optional)
```bash
python fastapi_app.py
```
Then visit: http://localhost:8000

---

## Step 5: Git Configuration

### Set Your Git Identity
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Check Repository Status
```bash
git status
git log --oneline -5
```

---

## Team Collaboration Workflow

### 1. Create Your Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes & Commit
```bash
git add .
git commit -m "Add your descriptive commit message"
```

### 3. Push to GitHub
```bash
git push origin feature/your-feature-name
```

### 4. Create Pull Request
- Go to GitHub repository
- Click "Pull Requests"
- Click "New Pull Request"
- Select your branch
- Add description and submit

---

## Common Issues & Solutions

### Issue: "GEMINI_API_KEY not found"
**Solution**: Make sure you created `.env` file and added your API key

### Issue: "Python command not found"
**Solution**: Use `python3` instead of `python` on Mac/Linux

### Issue: "Permission denied"
**Solution**: Make sure you have write permissions to the folder

### Issue: "Module not found"
**Solution**: Activate virtual environment and run `pip install -r requirements.txt`

---

## Project Structure Overview

```
crisisgrid/
|-- cleaning_pipeline.py      # Main cleaning pipeline
|-- fastapi_app.py          # Web application
|-- config.py               # Configuration
|-- services/              # Core services
|   |-- ai_mapper.py       # Gemini AI integration
|   |-- cleaner.py         # Data cleaning logic
|   |-- session_store.py   # Session management
|-- sample.csv            # Sample data for testing
|-- requirements.txt      # Python dependencies
|-- .env.example          # Environment template
```

---

## Development Guidelines

### Do's
- Use descriptive commit messages
- Create branches for new features
- Test your changes before committing
- Follow the existing code style

### Don'ts
- Never commit API keys or secrets
- Don't push directly to main branch
- Don't commit large files or binaries
- Don't share your personal API key

---

## Getting Help

### Internal Resources
- Check this README file
- Look at sample.csv for data format
- Review test files for examples

### External Resources
- Google Gemini API documentation
- FastAPI documentation
- Python pandas documentation

---

## Quick Commands Reference

```bash
# Clone repository
git clone https://github.com/yourusername/crisisgrid.git

# Setup environment
python -m venv venv
source venv/bin/activate  # Mac/Linux
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Setup environment variables
cp .env.example .env
# Edit .env with your API key

# Test setup
python test_api.py
python cleaning_pipeline.py sample.csv

# Start web app
python fastapi_app.py

# Git workflow
git checkout -b feature-name
git add .
git commit -m "Your message"
git push origin feature-name
```

---

## Need Support?

If you face any issues:
1. Check this guide first
2. Search existing GitHub issues
3. Create a new issue with detailed description
4. Contact team lead for urgent issues

**Welcome to CrisisGrid Team!** 

---

*Last updated: [Current Date]*
