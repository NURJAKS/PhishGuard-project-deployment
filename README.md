# 🛡️ PhishGuard AI

<div align="center">

**Modern AI-powered phishing detection system protecting users and financial institutions**

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green)](https://fastapi.tiangolo.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3%20Extension-yellow)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

*Real-time protection against phishing threats with advanced AI analysis*

</div>

## 🌟 Overview

PhishGuard AI is a comprehensive cybersecurity platform designed to detect and prevent phishing attacks in real-time. Combining multiple detection methods—from traditional blacklists to advanced LLM analysis—it provides robust protection for users, banks, and fintech companies, with special focus on Kazakhstan's digital landscape.

### 🎯 Key Features

- **🤖 AI-Powered Analysis**: Contextual phishing detection using Google Generative AI and OpenRouter
- **🛡️ Real-time Protection**: Automatic blocking of malicious sites and forms
- **🔍 Secret Scanning**: Deep JavaScript analysis with Pinkerton engine
- **📊 Analytics Dashboard**: Comprehensive statistics and incident monitoring
- **💳 Payment Protection**: Specialized analysis of payment pages and PAN masking
- **🌐 Multi-language Support**: Optimized for Kazakh and Russian phishing patterns
- **⚡ Microservices Architecture**: Scalable and modular design


## 🏗️ Architecture
```
Chrome Extension (extension/) [JS, MV3]
   ↓
FastAPI Backend (Agro_Phish/backend/) [Python 3.10+, SQLAlchemy, SQLite]
   ↓
AI Analysis Module (ai_analyzer.py + OpenRouter, Google GenAI, rules.json)
   ↓
Streamlit Dashboard (Agro_Phish/dashboard/)
   ↓
Pinkerton Engine (Pinkerton/) — deep JS secret scan
Optional: AWS Lambda version (PhishGuardAI/)
```

## 🚀 Quick Start
### Requirements
- Python 3.10+
- Node.js (for extension build)
- Chrome browser (for extension)
- (Optional) Docker

### 1. Backend
```bash
cd Agro_Phish/backend
python -m venv venv
source venv/bin/activate   # (Windows: venv\Scripts\activate)
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
API: http://localhost:8000

### 2. Chrome Extension
- Open Chrome → chrome://extensions
- Enable Developer Mode
- Load unpacked extension: Select `/Agro_Phish/extension/`
- Click shield icon to use

### 3. (Optional) Dashboard
```bash
cd Agro_Phish/dashboard
pip install -r requirements.txt
streamlit run app.py --server.port 8501
```
Dashboard: http://localhost:8501

### 4. (Optional) Docker Compose All-in-One
```bash
cd Agro_Phish
sudo docker-compose up -d
```

## 📑 API Endpoints
| Endpoint                  | Method | Description                           |
|--------------------------|--------|---------------------------------------|
| /v1/check/url            | POST   | Check URL for phishing indicators     |
| /v1/ai/scan              | POST   | LLM-based AI analysis of URL          |
| /v1/scan/secrets         | POST   | JS/API secret scan (Pinkerton)        |
| /analyze_payment         | POST   | Analyze payment form for phishing     |
| /incidents               | GET    | List phishing incidents               |
| /incidents/stats         | GET    | Incident statistics                   |
| /admin/blacklist         | GET/POST/DELETE | Manage blacklist         |
| /admin/auto-scan         | GET/POST | Toggle auto-AI scan setting          |
| /health                  | GET    | API health check                      |

## 🛠️ Technology Stack
- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, SQLite
- **Frontend extension**: JS (MV3 Chrome)
- **LLM Analysis**: Google Generative AI, OpenRouter API
- **Dashboard**: Streamlit
- **Secret scan**: Pinkerton, regex-based secret finding
- **Cloud**: (Optional) AWS Lambda (PhishGuardAI)
- **Docker/Compose** for devops

## 📂 Project Structure
```
PhishGuard/
  ├── Agro_Phish/
  │     ├── extension/           # Chrome extension (MV3)
  │     ├── backend/             # FastAPI backend
  │     ├── dashboard/           # Streamlit dashboard
  │     ├── docker-compose.yml   # Compose config
  ├── Pinkerton/                 # Secret scanner
  ├── PhishGuardAI/              # Optional AWS Lambda version
  ├── .gitignore                 # Unified
  ├── README.md                  # This file
  └── ...                        # Support, docs, etc
```

## 🤝 Contribution
Contributions are welcome! Please fork, branch, and open a Pull Request:
1. Fork and clone this repo
2. Create a feature branch
3. Push & open a PR (describe your change!)
4. For major/architecture questions: open an issue/discussion first

## 📄 License
Licensed under the MIT License. See LICENSE for details.

---
**Protect your digital future with PhishGuard!**

Contacts:
- Email: support@phishguard.kz
- GitHub Issues: https://github.com/NURJAKS/PhishGuard/issues
