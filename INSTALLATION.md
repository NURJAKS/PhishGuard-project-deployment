# 🚀 Быстрая установка PhishGuard AI

Этот файл содержит краткие инструкции для быстрого старта проекта после клонирования из GitHub.

## ⚡ Быстрый старт (5 минут)

### 1. Клонирование и переход в проект

```bash
git clone https://github.com/Nurbol876047/Phishguard_GOBUSTER.git
cd Phishguard_GOBUSTER/Agro_Phish
```

### 2. Установка зависимостей Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# или: venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

### 3. Настройка прав для Masscan (Linux/macOS)

```bash
cd ..
chmod +x setup_masscan_permissions.sh
sudo ./setup_masscan_permissions.sh
```

**Примечание для Windows**: Masscan требует WSL или Linux-подсистему. В Windows можно использовать альтернативные инструменты.

### 4. Запуск Backend

```bash
cd backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend будет доступен на: **http://localhost:8000**

### 5. Установка Chrome Extension

1. Откройте Chrome → `chrome://extensions/`
2. Включите **"Режим разработчика"**
3. Нажмите **"Загрузить распакованное расширение"**
4. Выберите папку: `Phishguard_GOBUSTER/Agro_Phish/extension/`

### 6. Проверка работоспособности

```bash
curl http://localhost:8000/health
```

Должен вернуть: `{"status":"healthy","timestamp":"..."}`

## ✅ Готово!

Теперь вы можете:
- Использовать Chrome Extension для проверки сайтов
- Вызывать API endpoints напрямую
- Запустить Dashboard (опционально)

## 📚 Дополнительная информация

Полная документация находится в файле [README.md](../README.md)

## ⚠️ Возможные проблемы

### Порт 8000 занят

```bash
# Найти процесс
lsof -i :8000  # Linux/macOS
netstat -ano | findstr :8000  # Windows

# Остановить
kill -9 <PID>  # Linux/macOS
```

### Masscan требует root

Убедитесь, что выполнили:
```bash
sudo ./setup_masscan_permissions.sh
```

### Python не найден

Установите Python 3.10+:
```bash
# Linux
sudo apt install python3 python3-venv python3-pip

# macOS
brew install python3

# Windows
# Скачайте с python.org
```

## 🔑 Опционально: Настройка AI (Google AI, OpenRouter)

Создайте файл `.env` в `backend/`:

```bash
cd backend
cat > .env << EOF
GOOGLE_AI_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
EOF
```

**Важно**: `.env` файл уже в `.gitignore` и не будет закоммичен.

