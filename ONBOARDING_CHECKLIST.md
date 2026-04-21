# CrisisGrid Team Member Onboarding Checklist

## Pre-Onboarding (Before Joining)

### Required Accounts
- [ ] GitHub account (create if don't have)
- [ ] Google Cloud account (for Gemini API)
- [ ] Code editor (VS Code recommended)

### Install Software
- [ ] Git (https://git-scm.com/downloads)
- [ ] Python 3.8+ (https://python.org/downloads)
- [ ] VS Code (https://code.visualstudio.com/)

---

## Day 1: Setup & Access

### Repository Access
- [ ] Receive GitHub repository link
- [ ] Get invited as collaborator (if private repo)
- [ ] Test repository access

### API Setup
- [ ] Get Gemini API key from Google Cloud Console
- [ ] Save API key securely (password manager recommended)
- [ ] Never share API key with anyone

### Clone & Setup
- [ ] Clone repository: `git clone [repository-url]`
- [ ] Navigate to project: `cd crisisgrid`
- [ ] Create virtual environment
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Copy `.env.example` to `.env`
- [ ] Add personal API key to `.env` file

### Initial Test
- [ ] Run: `python test_api.py`
- [ ] Run: `python cleaning_pipeline.py sample.csv`
- [ ] Verify web app starts: `python fastapi_app.py`

---

## Day 2: Understanding Project

### Code Review
- [ ] Read README.md completely
- [ ] Understand project structure
- [ ] Review main files: `cleaning_pipeline.py`, `fastapi_app.py`
- [ ] Check services folder structure

### Testing
- [ ] Test with sample data
- [ ] Try uploading different CSV files
- [ ] Test error scenarios
- [ ] Review API endpoints

### Documentation
- [ ] Read TEAM_SETUP_GUIDE.md
- [ ] Check existing issues on GitHub
- [ ] Review project documentation

---

## Day 3: Development Setup

### Git Configuration
- [ ] Set git user name: `git config --global user.name "Your Name"`
- [ ] Set git email: `git config --global user.email "your.email@example.com"`
- [ ] Test git configuration: `git config --list`

### Branch Creation
- [ ] Create feature branch: `git checkout -b feature/your-name-setup`
- [ ] Make a small test change
- [ ] Commit change: `git add . && git commit -m "Test setup"`
- [ ] Push branch: `git push origin feature/your-name-setup`

### Code Editor Setup
- [ ] Install Python extension in VS Code
- [ ] Install GitLens extension
- [ ] Setup code formatting (black, flake8)
- [ ] Configure Python interpreter

---

## Week 1: First Contributions

### Small Tasks
- [ ] Fix any typos in documentation
- [ ] Improve error messages
- [ ] Add comments to complex code
- [ ] Create test cases for existing functions

### Code Review Process
- [ ] Learn to create pull requests
- [ ] Review team's pull requests
- [ ] Understand code review guidelines
- [ ] Practice giving constructive feedback

### Communication
- [ ] Join team communication channel
- [ ] Introduce yourself to team
- [ ] Ask questions about unclear parts
- [ ] Share progress regularly

---

## Ongoing Responsibilities

### Daily Development
- [ ] Pull latest changes: `git pull origin main`
- [ ] Work on feature branches
- [ ] Test changes thoroughly
- [ ] Write meaningful commit messages

### Code Quality
- [ ] Follow existing code style
- [ ] Write tests for new features
- [ ] Update documentation
- [ ] Handle edge cases

### Security
- [ ] Never commit API keys
- [ ] Use environment variables
- [ ] Review sensitive code changes
- [ ] Report security issues

---

## Troubleshooting Guide

### Common Issues
- [ ] **API Key Issues**: Check `.env` file, verify key is valid
- [ ] **Python Issues**: Verify virtual environment is activated
- [ ] **Git Issues**: Check permissions, remote URL
- [ ] **Dependency Issues**: Try `pip install --upgrade -r requirements.txt`

### Getting Help
- [ ] Check documentation first
- [ ] Search existing GitHub issues
- [ ] Ask in team channel
- [ ] Create detailed issue if needed

---

## Progress Tracking

### Week 1 Goals
- [ ] Complete all setup tasks
- [ ] Make first contribution
- [ ] Understand codebase
- [ ] Setup development environment

### Week 2 Goals
- [ ] Complete first feature
- [ ] Write tests
- [ ] Participate in code reviews
- [ ] Document learnings

### Month 1 Goals
- [ ] Independent development
- [ ] Mentor new members
- [ ] Contribute to roadmap
- [ ] Suggest improvements

---

## Resources

### Internal
- TEAM_SETUP_GUIDE.md
- README.md
- GitHub Issues
- Team communication channel

### External
- Google Gemini API Docs
- FastAPI Documentation
- Python Pandas Docs
- Git Documentation

---

## Contact Information

### Team Lead
- Name: [Team Lead Name]
- Email: [team.lead@example.com]
- GitHub: [@teamlead]

### Technical Support
- For API issues: Check Google Cloud Console
- For Git issues: Refer to Git documentation
- For code issues: Create GitHub issue

---

## Quick Reference

### Essential Commands
```bash
# Daily workflow
git pull origin main
git checkout -b feature-name
# ... make changes ...
git add .
git commit -m "Descriptive message"
git push origin feature-name

# Testing
python test_api.py
python cleaning_pipeline.py sample.csv
python fastapi_app.py

# Environment
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows
```

### Important Files
- `.env` - Your personal API key (NEVER commit)
- `requirements.txt` - Python dependencies
- `sample.csv` - Test data
- `TEAM_SETUP_GUIDE.md` - Setup instructions

---

**Welcome aboard! We're excited to have you join CrisisGrid!** 

*This checklist should be completed within your first week. Let your team lead know if you need any help!*
