# 🛡️ PhishGuard AI - Advanced Protection Platform

PhishGuard AI is an advanced security platform designed to protect users from phishing, malware, and other web threats using Artificial Intelligence and a suite of powerful security tools.

---

## 🚀 Deployment (VPS Service)

To deploy the PhishGuard AI backend and services on your VPS, follow these simple steps:

### 🛠️ Prerequisites
- Linux VPS (Ubuntu/Debian recommended)
- Docker & Docker Compose (The deployment script will install them if missing)

### 📦 Installation
Run the following command in your terminal:

```bash
bash deploy.sh
```

### ⚙️ Configuration
The deployment will create a `.env` file in the root directory. **You MUST edit this file** to add your API keys:

```bash
nano .env
```
- `OPENAI_API_KEY`: Your OpenAI API key for advanced analysis.
- `TELEGRAM_BOT_TOKEN`: Token for automated security alerts.
- `TELEGRAM_CHAT_ID`: Your chat ID where notifications will be sent.

### 🌐 Accessing Services
- **API (FastAPI):** `https://phishguard.ddns.net` (Mapped to port 8000)
- **Dashboard (Streamlit):** `http://your-server-ip:8501`

---

## 📦 Extension (Chrome/Edge)

The PhishGuard browser extension provides real-time protection for your browser.

### 🔧 Configuration
The extension is pre-configured to prioritize the production domain `https://phishguard.ddns.net`. It also supports local development on port 8000.

### 🛠️ Installation (Developer Mode)
1.  Open Chrome and go to `chrome://extensions/`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked** and select the `Phish/extension` directory from this repository.

### 🔒 Security Policies
The extension uses a strict Content Security Policy (CSP) to ensure only authorized domains (PhishGuard API, Cloudflare, Google DNS, IpInfo) can communicate with it.

---

## 🛠️ Security Tools Integrated
- **AI Analyzer:** Powered by OpenAI & Google AI.
- **Nikto:** Web server vulnerability scanner.
- **Masscan:** Ultra-fast port scanner (used for infrastructure mapping).
- **Pinkerton:** Automated JS secret/vulnerability scanner.

---

## 📜 License
© 2026 PhishGuard Project. All rights reserved. For educational and cybersecurity research purposes only.
