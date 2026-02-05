#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/tools"
NIKTO_DIR="$TOOLS_DIR/nikto"
GOBUSTER_BIN="$TOOLS_DIR/gobuster/gobuster"
MASSCAN_BIN="$TOOLS_DIR/masscan/masscan"

echo "=== PhishGuard: обновление инструментов ==="

if command -v git >/dev/null 2>&1 && [ -d "$NIKTO_DIR/.git" ]; then
  echo "[nikto] обновление репозитория..."
  git -C "$NIKTO_DIR" pull --ff-only || echo "[nikto] предупреждение: не удалось обновить (нет сети или конфликт)"
else
  echo "[nikto] git не найден или репозиторий отсутствует, пропускаю"
fi

if [ -f "$NIKTO_DIR/program/nikto.pl" ]; then
  chmod +x "$NIKTO_DIR/program/nikto.pl" || true
fi

if [ -f "$GOBUSTER_BIN" ]; then
  chmod +x "$GOBUSTER_BIN" || true
  if "$GOBUSTER_BIN" version >/dev/null 2>&1; then
    echo "[gobuster] версия: $("$GOBUSTER_BIN" version)"
  else
    echo "[gobuster] предупреждение: не удалось получить версию"
  fi
else
  echo "[gobuster] бинарь не найден: $GOBUSTER_BIN"
fi

if [ -f "$MASSCAN_BIN" ]; then
  chmod +x "$MASSCAN_BIN" || true
  if "$MASSCAN_BIN" --version >/dev/null 2>&1; then
    echo "[masscan] версия: $("$MASSCAN_BIN" --version | head -1)"
  else
    echo "[masscan] предупреждение: не удалось получить версию"
  fi
  if command -v getcap >/dev/null 2>&1; then
    if ! getcap "$MASSCAN_BIN" | grep -q "cap_net_raw"; then
      echo "[masscan] нет прав на raw sockets."
      echo "          Выполните: sudo $ROOT_DIR/setup_masscan_permissions.sh"
    fi
  else
    echo "[masscan] getcap не найден (проверку прав пропущено)"
  fi
else
  echo "[masscan] бинарь не найден: $MASSCAN_BIN"
fi

echo "=== Готово ==="

