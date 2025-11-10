# 🛡️ PhishGuard

> Modern AI-powered system to detect and block phishing threats for Kazakhstan and beyond

---

## 🌐 Overview
PhishGuard is an advanced open-source platform protecting users, banks, and fintech from phishing. Built with a scalable microservices architecture and rich AI analysis, it includes:
- **Browser extension (MV3 Chrome)**
- **FastAPI backend (Python)**
- **AI/LLM-based analysis engine**
- **Streamlit statistics dashboard**
- **Integrated secret-scanning with Pinkerton**
- **Optional AWS Lambda detection service**

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

## ⚙️ Features
- Block dangerous sites and forms automatically
- Payment page analysis and PAN masking
- JavaScript/API secret detection
- Real-time, contextual LLM-powered phishing analysis
- Configurable blacklists, whitelists & keyword rules
- Visual analytics dashboard, admin panel, auto-scan toggle
- RESTful API for integration

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
