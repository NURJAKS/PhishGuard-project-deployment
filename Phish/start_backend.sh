#!/bin/bash

# Stop any existing backend process
echo "Stopping existing backend process..."
pkill -9 -f "uvicorn main:app"
sleep 2

# Set the Google API Key
export GOOGLE_API_KEY="AIzaSyDG0MRhz6A84J2n_QVhgQ-ArgeyXXwk2os"

# Navigate to the backend directory
cd "$(dirname "$0")/backend"

# Activate the virtual environment
source ../.venv/bin/activate

# Start the backend with uvicorn in the background, logging output
echo "Starting backend with GOOGLE_API_KEY..."
nohup env GOOGLE_API_KEY="$GOOGLE_API_KEY" python3 -m uvicorn main:app --host 0.0.0.0 --port 8002 > /tmp/phishguard_backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend launched with PID: $BACKEND_PID"

# Wait a moment for the server to start
sleep 3

# Check if the backend is running
if ps -p $BACKEND_PID > /dev/null
then
    echo "Backend is running."
    # Optional: check health endpoint
    curl -s http://localhost:8002/health
        echo ""
else
    echo "Failed to start backend."
    cat /tmp/phishguard_backend.log
fi
