# 🛡️ PhishGuard AI - Система защиты от фишинга

<div align="center">

**Современная AI-система защиты от фишинга с расширенными инструментами безопасности**

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green)](https://fastapi.tiangolo.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3%20Extension-yellow)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](LICENSE)

*Защита от фишинга в реальном времени с AI-анализом и инструментами безопасности*

</div>

---

## 📋 Содержание

- [Обзор](#-обзор)
- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Требования](#-требования)
- [Установка](#-установка)
- [Запуск](#-запуск)
- [Использование](#-использование)
- [API Документация](#-api-документация)
- [Инструменты безопасности](#-инструменты-безопасности)
- [Устранение неполадок](#-устранение-неполадок)
- [Разработка](#-разработка)

---

## 🌟 Обзор

PhishGuard AI — комплексная платформа кибербезопасности для обнаружения и предотвращения фишинговых атак в реальном времени. Система объединяет традиционные методы (черные/белые списки) с продвинутым AI-анализом и инструментами безопасности для защиты пользователей, банков и fintech компаний.

### 🎯 Основные возможности

- **🤖 AI-анализ**: Контекстное обнаружение фишинга с использованием Google Generative AI и OpenRouter
- **🛡️ Защита в реальном времени**: Автоматическая блокировка вредоносных сайтов и форм
- **🔍 Сканирование секретов**: Глубокий анализ JavaScript с движком Pinkerton
- **📊 Аналитическая панель**: Комплексная статистика и мониторинг инцидентов
- **💳 Защита платежей**: Специализированный анализ платежных страниц и маскирование PAN
- **📄 Анализ документов**: Проверка PDF, DOCX, XLSX файлов на фишинг
- **🧾 Проверка счетов**: Верификация счетов и инвойсов
- **🌐 Мультиязычность**: Оптимизация для казахского и русского языков
- **⚡ Микросервисная архитектура**: Масштабируемый и модульный дизайн
- **🔧 Инструменты безопасности**: Masscan, Gobuster, Nikto для аудита безопасности

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                    │
│              (extension/) - JavaScript, HTML                  │
│  • Popup UI • Background Service • Content Scripts          │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP/HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              FastAPI Backend (Agro_Phish/backend/)            │
│              Python 3.10+, SQLAlchemy, SQLite                 │
│  • REST API • AI Analysis • Secret Scanning                  │
│  • Payment Analysis • Document Analysis                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ AI Analyzer  │ │ Pinkerton    │ │ Tools        │
│ (Google AI,  │ │ Engine       │ │ (Masscan,    │
│ OpenRouter)  │ │ (JS Secrets) │ │ Gobuster)    │
└──────────────┘ └──────────────┘ └──────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         Streamlit Dashboard (Agro_Phish/dashboard/)          │
│                    Python, Streamlit                         │
│              • Statistics • Incident Monitoring              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Требования

### Системные требования

- **ОС**: Linux, macOS, или Windows
- **Python**: 3.10 или выше
- **Chrome/Chromium**: Последняя версия (для расширения)
- **Память**: Минимум 2GB RAM
- **Диск**: ~500MB свободного места

### Дополнительные инструменты

- **Masscan**: Встроен в проект (`tools/masscan/`)
- **Gobuster**: Встроен в проект (`tools/gobuster/`)
- **Nikto**: Опционально (для веб-сканирования)

---

## 🚀 Установка

> 💡 **Быстрый старт**: Для быстрой установки см. [INSTALLATION.md](INSTALLATION.md)

### 1. Клонирование репозитория

```bash
git clone https://github.com/Nurbol876047/Phishguard_GOBUSTER.git
cd Phishguard_GOBUSTER
```

### 2. Установка зависимостей Backend

```bash
cd Agro_Phish/backend

# Создание виртуального окружения
python3 -m venv venv

# Активация виртуального окружения
# Linux/macOS:
source venv/bin/activate
# Windows:
# venv\Scripts\activate

# Установка зависимостей
pip install -r requirements.txt
```

### 3. Настройка API ключей (опционально)

Для использования AI-анализа создайте файл `.env` в `Agro_Phish/backend/`:

```bash
cd Agro_Phish/backend
cat > .env << EOF
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
EOF
```

**Примечание**: AI-анализ работает и без API ключей, но с ограниченной функциональностью.

### 4. Настройка прав для Masscan

Masscan требует специальных прав для работы с raw sockets:

```bash
cd Agro_Phish
chmod +x setup_masscan_permissions.sh
sudo ./setup_masscan_permissions.sh
```

Или вручную:

```bash
sudo setcap cap_net_raw,cap_net_admin=eip Agro_Phish/tools/masscan/masscan
```

Проверка прав:

```bash
getcap Agro_Phish/tools/masscan/masscan
```

Должно вывести: `masscan = cap_net_admin,cap_net_raw+eip`

### 5. Установка зависимостей Dashboard (опционально)

```bash
cd Agro_Phish/dashboard
pip install -r requirements.txt
```

---

## ▶️ Запуск

### 1. Запуск Backend сервера

```bash
cd Agro_Phish/backend
source venv/bin/activate  # Linux/macOS
# или: venv\Scripts\activate  # Windows

python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend будет доступен на: **http://localhost:8000**

**Проверка работоспособности:**

```bash
curl http://localhost:8000/health
```

Должен вернуть: `{"status":"healthy","timestamp":"..."}`

### 2. Установка Chrome Extension

1. Откройте Chrome и перейдите на `chrome://extensions/`
2. Включите **"Режим разработчика"** (Developer Mode)
3. Нажмите **"Загрузить распакованное расширение"** (Load unpacked)
4. Выберите папку: `Agro_Phish/extension/`
5. Расширение установлено! Иконка щита появится в панели инструментов

### 3. Запуск Dashboard (опционально)

```bash
cd Agro_Phish/dashboard
streamlit run app.py --server.port 8501
```

Dashboard будет доступен на: **http://localhost:8501**

---

## 💻 Использование

### Chrome Extension

1. **Открыть popup**: Нажмите на иконку щита в панели инструментов
2. **Проверка URL**: Нажмите кнопку "Check URL" для анализа текущей страницы
3. **AI Scan**: Нажмите "AI Scan" для глубокого AI-анализа
4. **Port Scan**: Нажмите "Port Scan" для сканирования портов домена
5. **Gobuster**: Нажмите "Gobuster" для поиска директорий
6. **Dashboard**: Откройте панель статистики через кнопку "Dashboard"

### API Endpoints

#### Проверка URL

```bash
curl -X POST http://localhost:8000/v1/check/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

#### AI-анализ

```bash
curl -X POST http://localhost:8000/v1/ai/scan \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com"]}'
```

#### Port Scan

```bash
curl -X POST http://localhost:8000/v1/vuln/portscan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

#### Gobuster (поиск директорий)

```bash
curl -X POST http://localhost:8000/v1/vuln/gobuster \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

---

## 📚 API Документация

### Основные Endpoints

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/health` | GET | Проверка работоспособности API |
| `/v1/check/url` | POST | Проверка URL на фишинг |
| `/v1/ai/scan` | POST | AI-анализ URL с использованием LLM |
| `/v1/scan/secrets` | POST | Сканирование JavaScript на секреты |
| `/v1/vuln/portscan` | POST | Сканирование портов (Masscan) |
| `/v1/vuln/gobuster` | POST | Поиск директорий (Gobuster) |
| `/v1/vuln/nikto` | POST | Веб-сканирование (Nikto) |
| `/analyze_payment` | POST | Анализ платежных форм |
| `/v1/document/analyze` | POST | Анализ документов (PDF, DOCX, XLSX) |
| `/v1/invoice/verify` | POST | Проверка счетов |
| `/incidents` | GET | Список инцидентов |
| `/incidents/stats` | GET | Статистика инцидентов |
| `/admin/blacklist` | GET/POST/DELETE | Управление черным списком |
| `/admin/whitelist` | GET/POST/DELETE | Управление белым списком |
| `/admin/auto-scan` | GET/POST | Настройка автосканирования |

### Swagger UI

После запуска backend, документация доступна по адресу:

**http://localhost:8000/docs**

---

## 🔧 Инструменты безопасности

### Masscan - Сканирование портов

**Описание**: Быстрое сканирование всех 65535 портов на любом IP-адресе или домене.

**Использование в Extension**: Кнопка "Port Scan" в popup

**API**:
```bash
POST /v1/vuln/portscan
{
  "url": "https://example.com"
}
```

**Особенности**:
- Сканирует все порты (1-65535)
- Использует SYN Stealth Scan
- Скорость: ~10-15 секунд для всех портов
- Требует `setcap` права (настроено автоматически)

### Gobuster - Поиск директорий

**Описание**: Поиск скрытых директорий и файлов на веб-сервере.

**Использование в Extension**: Кнопка "Gobuster" в popup

**API**:
```bash
POST /v1/vuln/gobuster
{
  "url": "https://example.com"
}
```

**Особенности**:
- Использует встроенный wordlist
- Находит скрытые директории и файлы
- Поддержка различных расширений

### Nikto - Веб-сканирование

**Описание**: Комплексное сканирование веб-серверов на уязвимости.

**API**:
```bash
POST /v1/vuln/nikto
{
  "url": "https://example.com"
}
```

---

## 🐛 Устранение неполадок

### Backend не запускается

**Проблема**: Порт 8000 занят

**Решение**:
```bash
# Найти процесс на порту 8000
lsof -i :8000  # Linux/macOS
netstat -ano | findstr :8000  # Windows

# Остановить процесс
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows
```

### Masscan не работает

**Проблема**: `Masscan requires root privileges`

**Решение**:
```bash
cd Agro_Phish
sudo ./setup_masscan_permissions.sh
```

Или вручную:
```bash
sudo setcap cap_net_raw,cap_net_admin=eip Agro_Phish/tools/masscan/masscan
```

### Chrome Extension не подключается к Backend

**Проблема**: Расширение не может связаться с API

**Решение**:
1. Убедитесь, что backend запущен на порту 8000
2. Проверьте `chrome://extensions/` → PhishGuard → "Проверить доступ к URL-адресам"
3. Проверьте консоль расширения: `chrome://extensions/` → PhishGuard → "Просмотр сервис-воркера"

### Ошибки AI-анализа

**Проблема**: AI-анализ не работает

**Решение**:
- AI-анализ опционален и работает без API ключей с ограничениями
- Для полной функциональности настройте `.env` файл с API ключами
- Проверьте логи backend для деталей ошибок

### База данных не создается

**Проблема**: Ошибки при работе с БД

**Решение**:
```bash
cd Agro_Phish/backend
rm -rf database/phishguard.db  # Удалить старую БД
# Перезапустить backend - БД создастся автоматически
```

---

## 🔨 Разработка

### Структура проекта

```
Agro_Phish/
├── backend/                 # FastAPI Backend
│   ├── main.py             # Главный файл API
│   ├── ai_analyzer.py      # AI-анализ
│   ├── secret_scanner.py  # Сканирование секретов
│   ├── payment_analyzer.py # Анализ платежей
│   ├── document_analyzer.py # Анализ документов
│   ├── invoice_analyzer.py  # Проверка счетов
│   ├── models.py           # Модели БД
│   ├── database.py         # Настройка БД
│   ├── schemas.py          # Pydantic схемы
│   └── requirements.txt    # Python зависимости
│
├── extension/              # Chrome Extension (MV3)
│   ├── manifest.json      # Манифест расширения
│   ├── popup.html/js      # Popup интерфейс
│   ├── background.js      # Service Worker
│   ├── content.js         # Content Scripts
│   └── dashboard.html/js  # Dashboard страница
│
├── dashboard/              # Streamlit Dashboard
│   ├── app.py             # Главный файл
│   └── requirements.txt   # Зависимости
│
├── tools/                  # Инструменты безопасности
│   ├── masscan/           # Masscan binary
│   ├── gobuster/          # Gobuster binary
│   └── nikto/             # Nikto (опционально)
│
└── setup_masscan_permissions.sh  # Скрипт настройки прав
```

### Добавление новых функций

1. **Новый API endpoint**: Добавьте в `backend/main.py`
2. **Новая кнопка в Extension**: Добавьте в `extension/popup.html` и `popup.js`
3. **Новый инструмент**: Добавьте binary в `tools/` и создайте endpoint

### Тестирование

```bash
# Тест Backend
cd Agro_Phish/backend
source venv/bin/activate
python3 -m pytest  # Если есть тесты

# Тест API
curl http://localhost:8000/health
curl -X POST http://localhost:8000/v1/check/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'
```

---

## 📝 Лицензия

MIT License - см. файл LICENSE

---

## 🤝 Вклад

Приветствуются Pull Requests! Пожалуйста, создайте issue перед большими изменениями.

---

## 📞 Поддержка

- **Issues**: [GitHub Issues](https://github.com/Nurbol876047/Phishguard_GOBUSTER/issues)
- **Документация**: См. `/docs` в Swagger UI после запуска backend

---

## ✅ Чеклист установки

- [ ] Клонирован репозиторий
- [ ] Установлен Python 3.10+
- [ ] Создано виртуальное окружение
- [ ] Установлены зависимости backend
- [ ] Настроены права для Masscan (`sudo ./setup_masscan_permissions.sh`)
- [ ] Запущен backend сервер (порт 8000)
- [ ] Установлено Chrome Extension
- [ ] Проверена работоспособность (`/health` endpoint)
- [ ] (Опционально) Настроены API ключи для AI
- [ ] (Опционально) Запущен Dashboard

---

**Готово к использованию! 🚀**
