#!/bin/bash

# Скрипт для запуска PhishGuard Backend

echo "🛡️  PhishGuard Backend - Запуск сервера"
echo "========================================"
echo ""

# Получаем абсолютный путь к директории скрипта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

cd "$BACKEND_DIR" || {
    echo "❌ Ошибка: не удалось перейти в директорию backend"
    exit 1
}

# Проверяем наличие Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 не найден. Установите Python 3.10+"
    exit 1
fi

echo "✅ Python найден: $(python3 --version)"
echo ""

# Проверяем наличие pip
if ! python3 -m pip --version &> /dev/null; then
    echo "⚠️  pip не найден."
    echo "Установите pip командой: sudo apt install python3-pip"
    exit 1
fi

echo "✅ pip найден: $(python3 -m pip --version | head -1)"
echo ""

# Устанавливаем зависимости если нужно
echo "📦 Проверка зависимостей..."
MISSING_DEPS=()

if ! python3 -c "import fastapi" &> /dev/null; then
    MISSING_DEPS+=("fastapi")
fi
if ! python3 -c "import uvicorn" &> /dev/null; then
    MISSING_DEPS+=("uvicorn")
fi
if ! python3 -c "import sqlalchemy" &> /dev/null; then
    MISSING_DEPS+=("sqlalchemy")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "📥 Установка недостающих зависимостей: ${MISSING_DEPS[*]}"
    echo "   Это может занять несколько минут..."
    
    # Устанавливаем все зависимости с --break-system-packages (для систем с PEP 668)
    echo "   Установка всех зависимостей из requirements.txt..."
    python3 -m pip install --user --break-system-packages -r requirements.txt --quiet || {
        echo "❌ Ошибка при установке зависимостей"
        echo ""
        echo "Попробуйте установить вручную:"
        echo "   python3 -m pip install --user --break-system-packages -r requirements.txt"
        exit 1
    }
    echo "✅ Зависимости установлены"
else
    echo "✅ Все зависимости установлены"
fi
echo ""

# Создаем директорию для базы данных
mkdir -p database
echo "✅ Директория базы данных готова"
echo ""

# Проверяем, не занят ли порт 8000
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -tuln 2>/dev/null | grep -q ":8000 " || ss -tuln 2>/dev/null | grep -q ":8000 "; then
    echo "⚠️  Порт 8000 уже занят. Останавливаем старый процесс..."
    lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || pkill -f "uvicorn.*main:app" 2>/dev/null || true
    sleep 2
    echo "✅ Старые процессы остановлены"
    echo ""
fi

# Проверяем наличие файла main.py
if [ ! -f "main.py" ]; then
    echo "❌ Ошибка: файл main.py не найден в $BACKEND_DIR"
    exit 1
fi

# Запускаем сервер с правильными параметрами
echo "🚀 Запуск сервера..."
echo "   URL: http://localhost:8000"
echo "   Health check: http://localhost:8000/health"
echo "   API docs: http://localhost:8000/docs"
echo ""
echo "⚠️  Нажмите Ctrl+C для остановки сервера"
echo "========================================"
echo ""

# Убеждаемся, что PATH включает ~/.local/bin для доступа к установленным скриптам
export PATH="$HOME/.local/bin:$PATH"

# Запускаем сервер с правильными параметрами для работы с расширением
python3 -m uvicorn main:app \
    --reload \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    --access-log

