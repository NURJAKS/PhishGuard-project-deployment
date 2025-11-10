#!/usr/bin/env python3
"""Создание тестового PDF счёта-фактуры через reportlab"""
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from io import BytesIO

def create_test_invoice_pdf(filename="test_invoice.pdf"):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # Заголовок
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, height - 50, "СЧЁТ-ФАКТУРА № 101")
    c.setFont("Helvetica", 12)
    c.drawString(50, height - 70, "от 31 октября 2025 г.")
    
    # Продавец
    y = height - 120
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "Продавец:")
    c.setFont("Helvetica", 11)
    y -= 20
    c.drawString(50, y, "ООО \"ТехСервис\"")
    y -= 15
    c.drawString(50, y, "ИНН: 7722000000")
    y -= 15
    c.drawString(50, y, "КПП: 772201001")
    y -= 15
    c.drawString(50, y, "Адрес: г. Москва, ул. Техническая, д. 10")
    
    # Покупатель
    y -= 40
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "Покупатель:")
    c.setFont("Helvetica", 11)
    y -= 20
    c.drawString(50, y, "АО \"ФинБанк\"")
    y -= 15
    c.drawString(50, y, "ИНН: 7701000000")
    y -= 15
    c.drawString(50, y, "КПП: 770101001")
    y -= 15
    c.drawString(50, y, "Адрес: г. Алматы, пр. Абая, д. 150")
    
    # Таблица товаров
    y -= 40
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "№")
    c.drawString(100, y, "Наименование")
    c.drawString(300, y, "Кол-во")
    c.drawString(350, y, "Цена")
    c.drawString(400, y, "Сумма")
    
    y -= 20
    c.setFont("Helvetica", 10)
    c.drawString(50, y, "1")
    c.drawString(100, y, "Консультационные услуги")
    c.drawString(300, y, "1")
    c.drawString(350, y, "100000")
    c.drawString(400, y, "100000")
    
    y -= 20
    c.drawString(50, y, "2")
    c.drawString(100, y, "Техническая поддержка")
    c.drawString(300, y, "1")
    c.drawString(350, y, "18000")
    c.drawString(400, y, "18000")
    
    # Итого
    y -= 40
    c.setFont("Helvetica", 11)
    c.drawString(300, y, "Итого без НДС: 118000 руб.")
    y -= 20
    c.drawString(300, y, "НДС 20%: 23600 руб.")
    y -= 20
    c.setFont("Helvetica-Bold", 12)
    c.drawString(300, y, "Итого к оплате: 141600 руб.")
    
    # Срок оплаты
    y -= 40
    c.setFont("Helvetica", 11)
    c.drawString(50, y, "Срок оплаты: 10 ноября 2025 г.")
    
    # Подписи
    y -= 60
    c.setFont("Helvetica", 11)
    c.drawString(50, y, "Руководитель: _____________ Иванов И.И.")
    y -= 20
    c.drawString(50, y, "Главный бухгалтер: _____________ Петрова П.П.")
    
    c.save()
    buffer.seek(0)
    
    with open(filename, "wb") as f:
        f.write(buffer.getvalue())
    print(f"PDF создан: {filename}")

if __name__ == "__main__":
    try:
        create_test_invoice_pdf()
    except ImportError as e:
        print(f"Ошибка импорта: {e}")
        print("Установите reportlab: pip install reportlab")
