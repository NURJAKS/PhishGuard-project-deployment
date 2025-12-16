# 🔧 Настройка Masscan для работы без root

## Проблема

Masscan требует root привилегий для использования raw sockets. Однако запускать весь backend с root правами небезопасно.

## Решение

Используем `setcap` для предоставления masscan только необходимых прав на сетевые операции без полного root доступа.

## Установка прав

### Вариант 1: Автоматический скрипт (рекомендуется)

```bash
cd "/home/nurjaks/Development/New Phishguard v1/Agro_Phish"
sudo ./setup_masscan_permissions.sh
```

### Вариант 2: Вручную

```bash
sudo setcap cap_net_raw,cap_net_admin=eip /home/nurjaks/Development/New Phishguard\ v1/Agro_Phish/tools/masscan/masscan
```

## Проверка прав

После установки проверьте права:

```bash
getcap /home/nurjaks/Development/New\ Phishguard\ v1/Agro_Phish/tools/masscan/masscan
```

Должно вывести:
```
/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan = cap_net_admin,cap_net_raw+eip
```

## Как это работает

- `cap_net_raw` - позволяет использовать raw sockets (необходимо для masscan)
- `cap_net_admin` - позволяет управлять сетевыми интерфейсами
- `eip` - эффективные, наследуемые и разрешенные capabilities

После установки этих прав masscan сможет работать без полного root доступа.

## Безопасность

Это безопаснее чем запускать весь backend с root, так как:
- Права даются только masscan бинарнику
- Backend продолжает работать без root
- Минимальные необходимые права

## Альтернатива

Если не хотите использовать setcap, backend автоматически переключится на socket-based сканирование портов, которое работает без root, но менее эффективно.

