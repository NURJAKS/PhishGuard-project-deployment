#!/bin/bash

# Скрипт для настройки прав masscan для работы без полного root доступа
# Использует setcap для предоставления прав на raw sockets

echo "🔧 Настройка прав для Masscan"
echo "================================"
echo ""

# Определяем путь к masscan относительно расположения скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MASSCAN_BIN="$SCRIPT_DIR/tools/masscan/masscan"

# Проверяем существование masscan
if [ ! -f "$MASSCAN_BIN" ]; then
    echo "❌ Ошибка: Masscan не найден по пути: $MASSCAN_BIN"
    echo "   Убедитесь, что вы запускаете скрипт из корня проекта Agro_Phish/"
    exit 1
fi

echo "✓ Masscan найден: $MASSCAN_BIN"
echo ""

# Проверяем права доступа
if [ "$EUID" -ne 0 ]; then
    echo "⚠️  Для настройки прав требуется sudo."
    echo "Запустите скрипт с sudo:"
    echo "  sudo $0"
    echo ""
    echo "Или выполните команду вручную:"
    echo "  sudo setcap cap_net_raw,cap_net_admin=eip $MASSCAN_BIN"
    exit 1
fi

# Устанавливаем права через setcap
echo "Установка прав через setcap..."
setcap cap_net_raw,cap_net_admin=eip "$MASSCAN_BIN"

if [ $? -eq 0 ]; then
    echo "✅ Права успешно установлены!"
    echo ""
    echo "Проверка прав:"
    getcap "$MASSCAN_BIN"
    echo ""
    echo "Masscan теперь может работать без полного root доступа."
else
    echo "❌ Ошибка при установке прав."
    exit 1
fi

