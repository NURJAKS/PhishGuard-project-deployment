# 🚀 Быстрый запуск Backend с Google AI

## Проблема решена! ✅

Сервер запущен и использует ваш новый Google AI API ключ.

## Как запустить сервер в будущем

### Вариант 1: Использовать скрипт (рекомендуется)

```bash
cd /home/nurjaks/Development/PhishGuard/05.12.25_PhishGuard/Agro_Phish
./start_backend_with_google_ai.sh
```

### Вариант 2: Вручную

```bash
# 1. Перейдите в директорию backend
cd /home/nurjaks/Development/PhishGuard/05.12.25_PhishGuard/Agro_Phish/backend

# 2. Установите API ключ (если еще не установлен)
export GOOGLE_API_KEY="AIzaSyCG0lxFuEz8GnjMm4frdnm3Z0MVGNWnR7g"

# 3. Запустите сервер
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Проверка работы

1. **Health check**: http://localhost:8000/health
2. **API документация**: http://localhost:8000/docs
3. **Проверка API ключа**: В логах должно быть:
   ```
   [PAYMENT AI] API Key source: ENV (masked: AIzaSyCG0l...)
   ```

## Если порт 8000 занят

```bash
# Остановите старые процессы
lsof -ti:8000 | xargs kill -9

# Или используйте другой порт
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

## Постоянная установка API ключа

Чтобы не вводить ключ каждый раз, добавьте в `~/.bashrc` или `~/.zshrc`:

```bash
export GOOGLE_API_KEY="AIzaSyCG0lxFuEz8GnjMm4frdnm3Z0MVGNWnR7g"
```

Затем выполните:
```bash
source ~/.bashrc  # или source ~/.zshrc
```

## Текущий статус

✅ Сервер запущен на http://localhost:8000
✅ Google AI API ключ установлен и работает
✅ Готов к использованию с расширением Chrome

