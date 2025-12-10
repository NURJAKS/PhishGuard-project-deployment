# 🚀 Инструкция по отправке кода в GitHub

## ✅ Что уже сделано:

1. ✅ Git репозиторий настроен
2. ✅ Remote origin установлен на `https://github.com/NURJAKS/PHISHGUARD-V1.git`
3. ✅ Все изменения добавлены в staging
4. ✅ Создан коммит с описанием всех изменений

## 📝 Что нужно сделать:

### Вариант 1: Использовать Personal Access Token (рекомендуется)

1. **Создайте Personal Access Token на GitHub:**
   - Перейдите: https://github.com/settings/tokens
   - Нажмите "Generate new token (classic)"
   - Выберите scope: `repo` (полный доступ к репозиториям)
   - Скопируйте созданный токен

2. **Выполните push:**
   ```bash
   cd /home/nurjaks/Development/PhishGuard/05.12.25_PhishGuard
   git push -u origin main
   ```
   
   Когда попросит пароль, введите ваш **Personal Access Token** (не пароль от GitHub!)

### Вариант 2: Использовать GitHub CLI

```bash
# Установите GitHub CLI (если еще не установлен)
# Ubuntu/Debian:
sudo apt install gh

# Войдите в GitHub
gh auth login

# Выполните push
cd /home/nurjaks/Development/PhishGuard/05.12.25_PhishGuard
git push -u origin main
```

### Вариант 3: Настроить SSH ключи

```bash
# Генерируйте SSH ключ (если еще нет)
ssh-keygen -t ed25519 -C "nurjaks@users.noreply.github.com"

# Добавьте публичный ключ в GitHub
cat ~/.ssh/id_ed25519.pub
# Скопируйте вывод и добавьте в: https://github.com/settings/keys

# Измените remote на SSH
cd /home/nurjaks/Development/PhishGuard/05.12.25_PhishGuard
git remote set-url origin git@github.com:NURJAKS/PHISHGUARD-V1.git

# Выполните push
git push -u origin main
```

## 📦 Что будет отправлено:

- ✅ Интеграция Google AI для "AI scan payment"
- ✅ Исправление портов с 8002 на 8000
- ✅ Улучшение админ-панели (черный/белый списки)
- ✅ Документация по настройке Google AI
- ✅ Скрипт для запуска backend

## ⚠️ Важно:

В файле `Agro_Phish/backend/ai_analyzer.py` есть старый заблокированный API ключ в `DEFAULT_GOOGLE_API_KEY`. 
Рекомендуется использовать переменную окружения `GOOGLE_API_KEY` вместо хардкода ключа в коде.

## 🔗 Ссылки:

- Репозиторий: https://github.com/NURJAKS/PHISHGUARD-V1
- Создание токена: https://github.com/settings/tokens
- Настройка SSH: https://github.com/settings/keys

