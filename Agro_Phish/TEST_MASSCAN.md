# 🔧 Команды для тестирования Masscan

## 📍 Путь к masscan
```bash
/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan
```

## ✅ Проверка прав
```bash
getcap "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan"
```

Должно показать: `cap_net_admin,cap_net_raw=eip`

## 🎯 Тестовые команды

### 1. Тест на egov.kz (должен найти порты 80, 443)
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 195.12.113.2 -p 1-65535 --rate 10000 --wait 5 -oJ -
```

### 2. Тест на google.com (должен найти порты 80, 443)
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 142.250.185.78 -p 1-65535 --rate 10000 --wait 5 -oJ -
```

### 3. Тест на github.com (должен найти порты 22, 80, 443)
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 140.82.121.3 -p 1-65535 --rate 10000 --wait 5 -oJ -
```

### 4. Тест на scanme.nmap.org (тестовый сервер с открытыми портами)
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" scanme.nmap.org -p 1-65535 --rate 10000 --wait 5 -oJ -
```

### 5. Быстрый тест на популярные порты (быстрее, для проверки)
```bash
timeout 10 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 195.12.113.2 -p 80,443,22,8080,3306 --rate 10000 --wait 0 -oJ -
```

## 📊 Парсинг результатов

### Простой вывод портов:
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 195.12.113.2 -p 1-65535 --rate 10000 --wait 5 -oJ - 2>/dev/null | python3 -c "
import sys, json
data = sys.stdin.read().strip()
if data:
    results = json.loads(data)
    ports = []
    for item in results:
        if 'ports' in item:
            for p in item['ports']:
                if 'port' in p:
                    ports.append(p['port'])
    print('Найдено портов:', len(ports))
    print('Открытые порты:', sorted(ports))
else:
    print('Порты не найдены')
"
```

### Детальный вывод:
```bash
timeout 40 "/home/nurjaks/Development/New Phishguard v1/Agro_Phish/tools/masscan/masscan" 195.12.113.2 -p 1-65535 --rate 10000 --wait 5 -oJ - 2>&1 | tail -20
```

## 🔍 Проверка что сканируются все порты

Смотрите на прогресс в выводе:
- `Scanning 1 hosts [65535 ports/host]` - подтверждает что сканируются все порты
- `rate: X.XX-kpps, YY.YY% done` - показывает прогресс сканирования
- `found=X` - количество найденных портов

## ⚙️ Параметры команды

- `-p 1-65535` - сканировать все порты от 1 до 65535
- `--rate 10000` - скорость сканирования (10000 пакетов/сек)
- `--wait 5` - ждать 5 секунд после завершения для финальных результатов
- `-oJ -` - вывод в JSON формате в stdout
- `2>/dev/null` - скрыть прогресс (опционально)
- `timeout 40` - ограничение времени выполнения

## 🎯 Ожидаемые результаты

### egov.kz (195.12.113.2):
- Порты: 80, 443
- Время: ~10-15 секунд

### google.com:
- Порты: 80, 443
- Время: ~10-15 секунд

### github.com:
- Порты: 22, 80, 443
- Время: ~10-15 секунд

## 📝 Пример полного теста

```bash
# Переходим в директорию
cd "/home/nurjaks/Development/New Phishguard v1/Agro_Phish"

# Тест 1: egov.kz
echo "=== Тест egov.kz ==="
timeout 40 "./tools/masscan/masscan" 195.12.113.2 -p 1-65535 --rate 10000 --wait 5 -oJ - 2>/dev/null | python3 -c "
import sys, json
try:
    data = sys.stdin.read().strip()
    if data:
        results = json.loads(data)
        ports = [p['port'] for item in results if 'ports' in item for p in item['ports'] if 'port' in p]
        print(f'Найдено: {len(ports)} портов')
        print(f'Порты: {sorted(ports)}')
    else:
        print('Порты не найдены')
except Exception as e:
    print(f'Ошибка: {e}')
"
```

