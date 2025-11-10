#!/usr/bin/env python3
"""Тестирование новых функций: сохранение в БД, история, статистика"""
import requests
import time
import json
import sys

def test_new_features():
    print("="*60)
    print("ТЕСТИРОВАНИЕ НОВЫХ ФУНКЦИЙ")
    print("="*60)
    
    # Ждём запуска сервера
    print("\n1. Проверка доступности сервера...")
    for i in range(10):
        try:
            response = requests.get("http://localhost:8000/health", timeout=2)
            if response.status_code == 200:
                print("✓ Backend сервер запущен")
                break
        except:
            time.sleep(1)
    else:
        print("✗ Backend сервер не запустился")
        return False
    
    # Тест 1: Проверка счёта-фактуры (должен сохраниться в БД)
    print("\n2. Тестирование проверки счёта-фактуры (с сохранением в БД)...")
    try:
        pdf_file = "test_invoice.pdf"
        with open(pdf_file, 'rb') as f:
            files = {'file': (pdf_file, f, 'application/pdf')}
            response = requests.post(
                "http://localhost:8000/v1/invoice/verify",
                files=files,
                timeout=30
            )
        
        if response.status_code == 200:
            result = response.json()
            analysis_id = result.get('analysis_id')
            print(f"✓ Проверка выполнена, analysis_id: {analysis_id}")
            print(f"  Статус: {result.get('status')}, Скор: {result.get('score')}")
            
            # Тест 2: Получение из БД
            print("\n3. Тестирование получения из БД...")
            response2 = requests.get(f"http://localhost:8000/v1/invoice/analysis/{analysis_id}")
            if response2.status_code == 200:
                result2 = response2.json()
                print(f"✓ Данные получены из БД")
                print(f"  Doc hash: {result2.get('doc_hash', 'N/A')[:20]}...")
                print(f"  Timestamp: {result2.get('timestamp', 'N/A')}")
            else:
                print(f"✗ Ошибка получения из БД: {response2.status_code}")
        else:
            print(f"✗ Ошибка проверки: {response.status_code}")
            print(response.text[:200])
            return False
    except Exception as e:
        print(f"✗ Ошибка: {e}")
        return False
    
    # Тест 3: История проверок
    print("\n4. Тестирование истории проверок...")
    try:
        response = requests.get("http://localhost:8000/v1/invoice/history?limit=5")
        if response.status_code == 200:
            history = response.json()
            print(f"✓ История получена")
            print(f"  Всего проверок: {history.get('total', 0)}")
            print(f"  Получено: {len(history.get('checks', []))}")
            if history.get('checks'):
                latest = history['checks'][0]
                print(f"  Последняя проверка: {latest.get('filename')} - {latest.get('status')}")
        else:
            print(f"✗ Ошибка получения истории: {response.status_code}")
    except Exception as e:
        print(f"✗ Ошибка: {e}")
    
    # Тест 4: Статистика
    print("\n5. Тестирование статистики...")
    try:
        response = requests.get("http://localhost:8000/v1/invoice/stats")
        if response.status_code == 200:
            stats = response.json()
            print(f"✓ Статистика получена")
            print(f"  Всего проверок: {stats.get('total_checks', 0)}")
            print(f"  По статусам:")
            by_status = stats.get('by_status', {})
            print(f"    - Принято: {by_status.get('accepted', 0)}")
            print(f"    - Подозрительно: {by_status.get('suspicious', 0)}")
            print(f"    - Отклонено: {by_status.get('rejected', 0)}")
            print(f"  Средний скор: {stats.get('average_score', 0)}")
            print(f"  За 30 дней: {stats.get('recent_30_days', 0)}")
            print(f"  Авто-одобрение: {stats.get('auto_approval_rate', 0)}%")
            print(f"  Дубликаты: {stats.get('duplicate_documents', 0)}")
        else:
            print(f"✗ Ошибка получения статистики: {response.status_code}")
    except Exception as e:
        print(f"✗ Ошибка: {e}")
    
    print("\n" + "="*60)
    print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("="*60)
    return True

if __name__ == "__main__":
    success = test_new_features()
    sys.exit(0 if success else 1)

