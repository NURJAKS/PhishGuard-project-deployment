# PhishGuard C# - ASP.NET Core версия

Полная миграция PhishGuard с Python/FastAPI на C#/ASP.NET Core.

## Структура проекта

- **PhishGuard.API** - Web API приложение (ASP.NET Core)
- **PhishGuard.Core** - Общие DTOs и модели
- **PhishGuard.Data** - Entity Framework Core модели и контекст БД
- **PhishGuard.Services** - Бизнес-логика и сервисы

## Требования

- .NET 8.0 SDK
- SQLite (встроен в EF Core)

## Запуск

```bash
cd PhishGuard.API
dotnet restore
dotnet run
```

API будет доступен на `http://localhost:8000`

Swagger UI: `http://localhost:8000/swagger`

## Основные функции

- ✅ Проверка URL на фишинг
- ✅ Управление черным/белым списками
- ✅ Статистика инцидентов
- ✅ База данных SQLite через Entity Framework Core

## Миграция базы данных

База данных создается автоматически при первом запуске в папке `database/phishguard.db`

## API Endpoints

- `POST /v1/check/url` - Проверка URL
- `GET /v1/check/incidents` - Список инцидентов
- `GET /v1/check/incidents/stats` - Статистика
- `GET /v1/check/health` - Health check
- `GET /admin/blacklist` - Черный список
- `POST /admin/blacklist` - Добавить в черный список
- `DELETE /admin/blacklist/{domain}` - Удалить из черного списка
- `GET /admin/whitelist` - Белый список
- `POST /admin/whitelist` - Добавить в белый список
- `DELETE /admin/whitelist/{domain}` - Удалить из белого списка

