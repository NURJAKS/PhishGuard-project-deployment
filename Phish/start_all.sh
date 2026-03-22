#!/bin/bash
# Скрипт для запуска всего проекта PhishGuard

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Запуск PhishGuard ===${NC}\n"

# Проверка виртуального окружения (опционально)
if [ -d "$PROJECT_DIR/.venv" ]; then
    # Активация виртуального окружения
    source "$PROJECT_DIR/.venv/bin/activate"
fi

# Выбор python интерпретатора
PYTHON_BIN="python3"
if [ -x "$PROJECT_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"
fi

# Проверка портов
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q ":$port " || ss -tlnp 2>/dev/null | grep -q ":$port "; then
        return 0
    else
        return 1
    fi
}

# Остановка существующих процессов
if check_port 8002; then
    echo -e "${YELLOW}Порт 8002 занят, останавливаю старый процесс...${NC}"
    pkill -f "uvicorn.*main:app" || true
    sleep 2
fi

if check_port 8501; then
    echo -e "${YELLOW}Порт 8501 занят, останавливаю старый процесс...${NC}"
    pkill -f "streamlit.*dashboard/app.py" || true
    sleep 2
fi

# Запуск Backend
echo -e "${GREEN}Запуск Backend API (порт 8002)...${NC}"
cd backend
nohup "$PYTHON_BIN" -m uvicorn main:app --host 0.0.0.0 --port 8002 > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..
echo -e "  Backend запущен (PID: $BACKEND_PID)"

# Запуск Dashboard
echo -e "${GREEN}Запуск Streamlit Dashboard (порт 8501)...${NC}"
mkdir -p logs
nohup streamlit run dashboard/app.py --server.port 8501 --server.address 0.0.0.0 > logs/dashboard.log 2>&1 &
DASHBOARD_PID=$!
echo -e "  Dashboard запущен (PID: $DASHBOARD_PID)"

# Ожидание запуска
echo -e "\n${YELLOW}Ожидание запуска сервисов...${NC}"
sleep 5

# Проверка статуса
echo -e "\n${GREEN}=== Статус сервисов ===${NC}"

# Проверка Backend
if check_port 8002; then
    if curl -s http://localhost:8002/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend API: http://localhost:8002${NC}"
        echo -e "   - Health: $(curl -s http://localhost:8002/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo 'проверка...')"
        echo -e "   - Docs: http://localhost:8002/docs"
    else
        echo -e "${RED}❌ Backend не отвечает${NC}"
    fi
else
    echo -e "${RED}❌ Backend не запустился${NC}"
fi

# Проверка Dashboard
if check_port 8501; then
    if curl -s http://localhost:8501/_stcore/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Streamlit Dashboard: http://localhost:8501${NC}"
    else
        echo -e "${YELLOW}⚠️  Dashboard запускается...${NC}"
    fi
else
    echo -e "${RED}❌ Dashboard не запустился${NC}"
fi

echo -e "\n${GREEN}=== Готово! ===${NC}"
echo -e "Логи:"
echo -e "  - Backend: tail -f logs/backend.log"
echo -e "  - Dashboard: tail -f logs/dashboard.log"
echo -e "\nДля остановки:"
echo -e "  pkill -f 'uvicorn.*main:app'"
echo -e "  pkill -f 'streamlit.*dashboard/app.py'"



