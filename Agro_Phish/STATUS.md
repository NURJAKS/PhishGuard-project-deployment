# ✅ Статус PhishGuard Backend

## Сервер запущен и работает!

- **URL:** http://localhost:8000
- **Health Check:** http://localhost:8000/health
- **API Docs:** http://localhost:8000/docs
- **Статус:** ✅ Работает

## Проверка работы

Выполните в терминале:
```bash
curl http://localhost:8000/health
```

Должен вернуться:
```json
{"status":"healthy","timestamp":"..."}
```

## Управление сервером

### Остановка сервера
```bash
pkill -f "uvicorn.*main:app"
```

### Перезапуск сервера
```bash
cd Agro_Phish
./start_backend.sh
```

### Проверка статуса
```bash
./check_backend.sh
```

## Расширение Chrome

После запуска сервера:
1. Откройте `chrome://extensions`
2. Найдите PhishGuard
3. Нажмите кнопку обновления (🔄)
4. Откройте любую страницу и проверьте работу расширения

## Логи сервера

Логи сервера сохраняются в `/tmp/phishguard.log`:
```bash
tail -f /tmp/phishguard.log
```

## Решение проблем

### Сервер не запускается
1. Проверьте, что все зависимости установлены:
   ```bash
   cd Agro_Phish/backend
   python3 -m pip install --user --break-system-packages -r requirements.txt
   ```

2. Проверьте, что порт 8000 свободен:
   ```bash
   lsof -i :8000
   ```

### Расширение не подключается
1. Убедитесь, что сервер запущен: `curl http://localhost:8000/health`
2. Перезагрузите расширение в `chrome://extensions`
3. Проверьте консоль расширения (F12 в popup)

