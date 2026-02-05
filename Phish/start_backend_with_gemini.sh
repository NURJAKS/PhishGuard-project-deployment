#!/bin/bash
cd "$(dirname "$0")"
export GOOGLE_API_KEY="AIzaSyDG0MRhz6A84J2n_QVhgQ-ArgeyXXwk2os"
source .venv/bin/activate
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8002

