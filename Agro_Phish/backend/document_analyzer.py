import os
import logging
import uuid
from typing import Dict, Any, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)

# Try to import document processing libraries
try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logger.warning("PyPDF2 not available, PDF processing disabled")

try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False
    logger.warning("python-docx not available, DOCX processing disabled")

try:
    import mammoth
    DOCX_MAMMOTH_AVAILABLE = True
except ImportError:
    DOCX_MAMMOTH_AVAILABLE = False

try:
    from ai_analyzer import _openrouter_analyze, _google_ai_analyze
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    logger.warning("AI analyzer not available")

# Storage for document analyses (in production, use database)
DOCUMENT_ANALYSES = {}


def extract_text_from_pdf(file_content: bytes) -> str:
    """Извлекает текст из PDF файла"""
    if not PDF_AVAILABLE:
        raise ImportError("PyPDF2 not installed")
    
    try:
        import io
        pdf_file = io.BytesIO(file_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        raise


def extract_text_from_docx(file_content: bytes) -> str:
    """Извлекает текст из DOCX файла"""
    if not DOCX_AVAILABLE and not DOCX_MAMMOTH_AVAILABLE:
        raise ImportError("python-docx or mammoth not installed")
    
    try:
        import io
        docx_file = io.BytesIO(file_content)
        
        # Try python-docx first
        if DOCX_AVAILABLE:
            doc = Document(docx_file)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        
        # Fallback to mammoth
        if DOCX_MAMMOTH_AVAILABLE:
            result = mammoth.extract_raw_text(docx_file)
            return result.value.strip()
        
        raise ImportError("No DOCX library available")
    except Exception as e:
        logger.error(f"Error extracting text from DOCX: {e}")
        raise


def extract_banking_data(text: str) -> Dict[str, Any]:
    """Извлекает банковские данные из текста используя паттерны и AI"""
    extracted = {}
    
    # Паттерны для поиска банковских данных
    import re
    
    # Номер карты (16 цифр)
    card_match = re.search(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', text)
    if card_match:
        extracted['card_number'] = re.sub(r'[\s-]', '', card_match.group())
    
    # IBAN
    iban_match = re.search(r'\b[A-Z]{2}\d{2}[\s-]?[A-Z0-9]{4,30}\b', text, re.IGNORECASE)
    if iban_match:
        extracted['iban'] = iban_match.group().replace(' ', '').replace('-', '')
    
    # БИК (9 цифр)
    bik_match = re.search(r'\b\d{9}\b', text)
    if bik_match:
        extracted['bik'] = bik_match.group()
    
    # ИНН (10 или 12 цифр)
    inn_match = re.search(r'\b\d{10}\b|\b\d{12}\b', text)
    if inn_match:
        extracted['inn'] = inn_match.group()
    
    # Номер счета (20 цифр)
    account_match = re.search(r'\b\d{20}\b', text)
    if account_match:
        extracted['account_number'] = account_match.group()
    
    # Телефон
    phone_match = re.search(r'\+?7[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}', text)
    if phone_match:
        extracted['phone'] = phone_match.group()
    
    # Email
    email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
    if email_match:
        extracted['email'] = email_match.group()
    
    # Название банка (простые паттерны)
    bank_keywords = ['банк', 'bank', 'банкинг', 'banking']
    for keyword in bank_keywords:
        pattern = rf'\b([А-ЯЁA-Z][а-яёa-z]+\s*{keyword}[а-яёa-z]*)\b'
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            extracted['bank_name'] = match.group(1)
            break
    
    if AI_AVAILABLE and len(text) > 100:
        try:
            ai_prompt = f"""Проанализируй следующий текст документа и извлеки банковские данные в формате JSON. 
Ищи: название банка, номер счета, номер карты, IBAN, БИК, ИНН, сумму, дату, имя клиента, номер договора.
Если данных нет, верни пустой объект {{}}.
nni 
Текст документа:
{text[:5000]}

Ответь ТОЛЬКО в формате JSON с ключами: bank_name, account_number, card_number, iban, bik, inn, amount, date, client_name, contract_number.
Значения должны быть строками или null."""

            ai_result = _openrouter_analyze(ai_prompt)
            if ai_result:
                try:
                    ai_data = json.loads(ai_result)
                    # Объединяем результаты AI с паттернами
                    for key, value in ai_data.items():
                        if value and value != 'null' and value != 'None':
                            extracted[key] = str(value)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse AI extraction result")
        except Exception as e:
            logger.warning(f"AI extraction failed: {e}")
    
    return extracted


def analyze_document_for_phishing(text: str) -> Dict[str, Any]:
    """Анализирует документ на признаки фишинга и социальной инженерии"""
    if not AI_AVAILABLE:
        return {
            "is_phishing": False,
            "risk": "LOW",
            "reasons": []
        }
    
    try:
        prompt = f"""Проанализируй следующий текст документа на признаки фишинга и социальной инженерии.
Ищи: подозрительные просьбы о передаче данных, угрозы, срочность, поддельные банковские уведомления, мошеннические схемы.

Текст документа:
{text[:8000]}

Ответь СТРОГО в формате JSON с ключами:
- is_phishing: true/false
- risk: "HIGH"/"MEDIUM"/"LOW"
- reasons: массив строк с причинами (на русском языке, простыми словами)

Если документ безопасен, верни is_phishing: false, risk: "LOW", reasons: []."""

        ai_result = _openrouter_analyze(prompt)
        if ai_result:
            try:
                result = json.loads(ai_result)
                return {
                    "is_phishing": result.get("is_phishing", False),
                    "risk": result.get("risk", "LOW").upper(),
                    "reasons": result.get("reasons", [])
                }
            except json.JSONDecodeError:
                logger.warning("Failed to parse phishing analysis result")
    except Exception as e:
        logger.warning(f"Phishing analysis failed: {e}")
    
    # Fallback: простой анализ по ключевым словам
    phishing_keywords = [
        'срочно', 'немедленно', 'заблокирован', 'заблокируем',
        'переведите деньги', 'отправьте данные', 'подтвердите доступ',
        'ваш счет заблокирован', 'требуется подтверждение'
    ]
    
    text_lower = text.lower()
    found_reasons = []
    for keyword in phishing_keywords:
        if keyword in text_lower:
            found_reasons.append(f"Обнаружено подозрительное слово: '{keyword}'")
    
    return {
        "is_phishing": len(found_reasons) > 2,
        "risk": "HIGH" if len(found_reasons) > 2 else ("MEDIUM" if len(found_reasons) > 0 else "LOW"),
        "reasons": found_reasons
    }


def analyze_document(file_content: bytes, filename: str, file_type: str) -> Dict[str, Any]:
    """Основная функция анализа документа"""
    analysis_id = str(uuid.uuid4())
    try:
        if file_type == 'application/pdf':
            text_content = extract_text_from_pdf(file_content)
        elif file_type in ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
            text_content = extract_text_from_docx(file_content)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
        
        if not text_content or len(text_content.strip()) < 10:
            raise ValueError("Не удалось извлечь текст из документа")
        
        # Извлекаем банковские данные
        extracted_data = extract_banking_data(text_content)
        
        # Анализируем на фишинг
        phishing_analysis = analyze_document_for_phishing(text_content)
        
        # Определяем общий уровень риска
        risk = phishing_analysis.get("risk", "LOW")
        if phishing_analysis.get("is_phishing", False):
            risk = "HIGH"
        elif len(extracted_data) > 5:  # Много банковских данных
            risk = "MEDIUM" if risk == "LOW" else risk
        
        # Сохраняем результат анализа
        result = {
            "analysis_id": analysis_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": len(file_content),
            "text_content": text_content,
            "extracted_data": extracted_data,
            "phishing_analysis": phishing_analysis,
            "risk": risk,
            "analyzed_at": datetime.now().isoformat()
        }
        
        DOCUMENT_ANALYSES[analysis_id] = result
        
        logger.info(f"Document analyzed: {filename}, risk={risk}, extracted_fields={len(extracted_data)}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error analyzing document: {e}")
        raise


def get_analysis(analysis_id: str) -> Optional[Dict[str, Any]]:
    """Получает результат анализа по ID"""
    return DOCUMENT_ANALYSES.get(analysis_id)

