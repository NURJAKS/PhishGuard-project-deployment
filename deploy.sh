#!/bin/bash

# PhishGuard AI - Unified Deployment Script
# This script automates Docker installation, environment setup, and service launch.

set -e

# ANSI Color Codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting PhishGuard AI Production Deployment...${NC}"

# 1. System Update
echo -e "${YELLOW}🔄 Updating system packages...${NC}"
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Docker & Docker Compose if missing
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker installed.${NC}"
else
    echo -e "${GREEN}✅ Docker is already installed.${NC}"
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed.${NC}"
else
    echo -e "${GREEN}✅ Docker Compose is already installed.${NC}"
fi

# 3. Environment Configuration
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}📝 .env file not found. Creating from template...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env and add your API keys correctly!${NC}"
    else
        echo -e "${RED}❌ .env.example not found! Creating a basic .env...${NC}"
        cat > .env <<EOF
# PhishGuard AI - Environment Configuration
OPENAI_API_KEY=your_key_here
PRIMARY_AI_PROVIDER=openai
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
API_BASE_URL=https://phishguard.ddns.net
EOF
    fi
fi

# 4. Setup Permissions for Security Tools
echo -e "${YELLOW}🔧 Configuring security tool permissions...${NC}"
find . -name "*.sh" -exec chmod +x {} \;

if [ -f "./Phish/setup_masscan_permissions.sh" ]; then
    sudo ./Phish/setup_masscan_permissions.sh
fi

# 5. Launch Services
echo -e "${BLUE}🏗️  Building and launching PhishGuard AI stack...${NC}"
docker-compose down --remove-orphans
docker-compose up -d --build

echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}✅ PhishGuard AI Deployment Successful!${NC}"
echo -e "${GREEN}----------------------------------------------------${NC}"
echo -e "${BLUE}🌐 Production API:  ${NC}https://phishguard.ddns.net"
echo -e "${BLUE}📊 Dashboard (AI): ${NC}http://$(curl -s ifconfig.me):8501"
echo -e "${GREEN}----------------------------------------------------${NC}"
echo -e "${YELLOW}💡 Useful Commands:${NC}"
echo -e "   - View Logs:    docker-compose logs -f"
echo -e "   - Stop All:     docker-compose down"
echo -e "   - Restart:      docker-compose restart"
echo -e "${GREEN}====================================================${NC}"
