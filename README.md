# 🛡️ PhishGuard AI

A modern AI-powered phishing defense system that acts as a smart guard in your browser. It automatically analyzes websites in real-time to alert you of suspicious or malicious activity.

## ✨ Features

- **Real-time Protection**: Actively blocks dangerous sites as you browse.
- **Smart AI Analysis**: Utilizes Generative AI to identify complex phishing patterns.
- **Payment Security**: Inspects payment pages to ensure your card details remain safe.
- **Document Scanning**: Analyzes PDFs and other documents for fraudulent links or data.
- **Security Tools**: Built-in port scanning, secrets scanning, and directory fuzzing.

## 📋 Requirements

- Python 3.10+
- Node.js (for potential frontend/extension builds)
- Google Chrome or Chromium-based browser

## 🚀 Installation & Setup

### 1. Clone the Project
```bash
git clone https://github.com/NURJAKS/clean-phishguard.git
cd clean-phishguard
```

### 2. Backend Setup
```bash
cd Agro_Phish/backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Variables (Recommended)
Create a `.env` file in `Agro_Phish/backend/`:
```env
# Optional but highly recommended for full AI features
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## ▶️ Running the Application

### Start the Backend API Server
```bash
cd Agro_Phish/backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*The API will be available at [http://localhost:8000](http://localhost:8000)*

### Start the Analytics Dashboard (Optional)
```bash
cd Agro_Phish/dashboard
# Ensure dependencies are installed: pip install -r requirements.txt
streamlit run app.py --server.port 8501
```
*The dashboard will be available at [http://localhost:8501](http://localhost:8501)*

### Install the Browser Extension
1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** in the top right corner.
3. Click **Load unpacked** and select the `Agro_Phish/extension/` directory.
4. The PhishGuard AI shield icon will appear in your browser toolbar!

## 📜 License
MIT License
