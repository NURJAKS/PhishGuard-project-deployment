#!/usr/bin/env python3
"""Тестирование API проверки счёта-фактуры"""
import requests
import time
import json
import sys
import os

def test_invoice_api():
    # Ждём запуска сервера
    print("Ожидание запуска backend сервера...")
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
    
    # Ищем PDF файл
    pdf_paths = [
        "test_invoice.pdf",
        "backend/test_invoice.pdf",
        "../test_invoice.pdf"
    ]
    
    pdf_file = None
    for path in pdf_paths:
        if os.path.exists(path):
            pdf_file = path
            break
    
    if not pdf_file:
        print("✗ PDF файл не найден")
        print("Попробованные пути:", pdf_paths)
        return False
    
    print(f"✓ Найден PDF файл: {pdf_file}")
    
    # Тестируем API
    print("\nТестирование API /v1/invoice/verify...")
    try:
        with open(pdf_file, 'rb') as f:
            files = {'file': (os.path.basename(pdf_file), f, 'application/pdf')}
            response = requests.post(
                "http://localhost:8000/v1/invoice/verify",
                files=files,
                timeout=30
            )
        
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n" + "="*60)
            print("РЕЗУЛЬТАТЫ ПРОВЕРКИ:")
            print("="*60)
            print(f"Статус: {result.get('status', 'N/A')}")
            print(f"Риск-скор: {result.get('score', 'N/A')}/100")
            print(f"Analysis ID: {result.get('analysis_id', 'N/A')}")
            
            if result.get('invoice'):
                invoice = result['invoice']
                print("\nИзвлечённые реквизиты:")
                print(f"  Номер: {invoice.get('number', 'N/A')}")
                print(f"  Дата: {invoice.get('issue_date', 'N/A')}")
                print(f"  Сумма: {invoice.get('total_amount', 'N/A')}")
                if invoice.get('seller'):
                    print(f"  Продавец: {invoice['seller'].get('name', 'N/A')}")
                    print(f"  ИНН продавца: {invoice['seller'].get('inn', 'N/A')}")
                    print(f"  КПП продавца: {invoice['seller'].get('kpp', 'N/A')}")
            
            if result.get('checks'):
                print("\nПроверки:")
                for check in result['checks']:
                    status = "✓" if check.get('ok') else "✗"
                    print(f"  {status} {check.get('name', 'N/A')}")
                    if check.get('details'):
                        for detail in check['details']:
                            print(f"    - {detail}")
            
            if result.get('reasons'):
                print("\nПричины:")
                for reason in result['reasons']:
                    print(f"  - {reason}")
            
            if result.get('recommendations'):
                print("\nРекомендации:")
                for rec in result['recommendations']:
                    print(f"  - {rec}")
            
            print("\n" + "="*60)
            return True
        else:
            print(f"✗ Ошибка API: {response.status_code}")
            try:
                error_data = response.json()
                print(f"Детали: {json.dumps(error_data, indent=2, ensure_ascii=False)}")
            except:
                print(f"Текст ответа: {response.text[:500]}")
            return False
            
    except Exception as e:
        print(f"✗ Ошибка при тестировании: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_invoice_api()
    sys.exit(0 if success else 1)

