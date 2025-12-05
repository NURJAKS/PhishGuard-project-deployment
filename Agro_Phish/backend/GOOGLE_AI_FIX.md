# 🔧 Исправление проблемы с Google AI API

## Проблема
API ключ по умолчанию был заблокирован Google (помечен как скомпрометированный). Ошибка: `403 PERMISSION_DENIED: Your API key was reported as leaked.`

## Решение

### Шаг 1: Получите новый API ключ Google AI

1. Перейдите на https://aistudio.google.com/
2. Войдите в свой Google аккаунт
3. Нажмите "Get API key" или "Получить API ключ"
4. Создайте новый проект или выберите существующий
5. Скопируйте новый API ключ

### Шаг 2: Установите переменную окружения

**Linux/Mac:**
```bash
export GOOGLE_API_KEY="ваш_новый_ключ_здесь"
```

**Windows (PowerShell):**
```powershell
$env:GOOGLE_API_KEY="ваш_новый_ключ_здесь"
```

**Windows (CMD):**
```cmd
set GOOGLE_API_KEY=ваш_новый_ключ_здесь
```

### Шаг 3: Перезапустите backend сервер

```bash
cd Agro_Phish/backend
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Альтернативный способ: Создайте файл .env

Создайте файл `.env` в папке `backend/`:
```
GOOGLE_API_KEY=ваш_новый_ключ_здесь
```

Затем установите `python-dotenv` и загрузите переменные в `main.py`:
```python
from dotenv import load_dotenv
load_dotenv()
```

## Проверка работы

После установки ключа проверьте логи backend сервера. Должно появиться:
```
[PAYMENT AI] API Key source: ENV (masked: AIzaSyDm-C...)
```

Если видите ошибку `403 PERMISSION_DENIED`, значит ключ все еще заблокирован - создайте новый.

## Важно

- **НЕ коммитьте API ключи в Git!** Используйте переменные окружения или `.env` файл (который должен быть в `.gitignore`)
- Если ключ скомпрометирован, создайте новый в Google AI Studio
- Проверьте квоты API в Google Cloud Console

