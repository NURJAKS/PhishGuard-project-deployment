#!/bin/bash

# PhishGuard AI - VPS Setup & Deployment Script
# This script automates the installation of Docker and starts the PhishGuard AI stack.

set -e

echo "🚀 Starting PhishGuard AI VPS Setup..."

# 1. Install Docker & Docker Compose if missing
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker installed."
else
    echo "✅ Docker is already installed."
fi

if ! command -v docker-compose &> /dev/null; then
    echo "🐳 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed."
else
    echo "✅ Docker Compose is already installed."
fi

# 2. Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️ Warning: .env file not found in the root directory!"
    echo "Please create a .env file with your API keys before running docker-compose."
    echo "Template provided in .env.example"
    # exit 1 (Optional: let them fix it later)
fi

# 3. Setup permissions for tools (Masscan)
echo "🔧 Setting up permissions for security tools..."
if [ -f "./Phish/setup_masscan_permissions.sh" ]; then
    chmod +x ./Phish/setup_masscan_permissions.sh
    sudo ./Phish/setup_masscan_permissions.sh
else
    echo "❌ setup_masscan_permissions.sh not found. Skipping."
fi

# 4. Start the stack
echo "🏗️ Building and starting the containers..."
docker-compose up -d --build

echo ""
echo "===================================================="
echo "✅ PhishGuard AI is starting up!"
echo "----------------------------------------------------"
echo "🌐 API Endpoint: http://$(curl -s ifconfig.me):8000"
echo "📊 Dashboard: http://$(curl -s ifconfig.me):8501"
echo "----------------------------------------------------"
echo "💡 Use 'docker-compose logs -f' to see real-time logs."
echo "💡 Remember to configure your .env file with AI keys."
echo "===================================================="
