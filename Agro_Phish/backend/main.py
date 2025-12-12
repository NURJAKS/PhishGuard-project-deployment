from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime
from urllib.parse import urlparse, quote
import json
import os
import logging
from typing import List, Optional
import re
import subprocess
import shutil

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

from models import Incident, PaymentCheck, InvoiceCheck
from database import get_db, create_tables
from schemas import PaymentAnalysisRequest, PaymentAnalysisResponse
from payment_analyzer import analyze_payment_page, sha256_hex, mask_pan
from secret_scanner import scan_url_for_js_secrets
from pinkerton_integration import run_pinkerton
from ai_analyzer import analyze_urls_with_llm, _fetch_text, _collect_js_urls, analyze_payment_with_ai, analyze_url_full_audit
from document_analyzer import analyze_document, get_analysis
from invoice_analyzer import verify_invoice, get_invoice_analysis
from fastapi import UploadFile, File
from fastapi.responses import FileResponse, HTMLResponse
import os
import requests
import uuid
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
NIKTO_ROOT = BASE_DIR / "tools" / "nikto"
NIKTO_PROGRAM = NIKTO_ROOT / "program" / "nikto.pl"
GOBUSTER_BIN = BASE_DIR / "tools" / "gobuster" / "gobuster"

app = FastAPI(
    title="PhishGuard API",
    description="API для проверки URL на фишинг и мошенничество",
    version="1.0.0"
)

# Демо-статические страницы (для проверки оплаты) по http://localhost:8000/fake_phish_site/
try:
    app.mount("/fake_phish_site", StaticFiles(directory="../fake_phish_site", html=True), name="fake_demo")
except Exception:
    # игнорируем, если каталога нет в окружении
    pass

# Статические страницы для управления документами
try:
    static_dir = Path("./static")
    static_dir.mkdir(exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_dir), html=True), name="static")
except Exception as e:
    logging.warning(f"Could not mount static directory: {e}")

# Главная страница для управления документами
@app.get("/documents", response_class=HTMLResponse)
async def documents_page():
    """Веб-страница для управления документами"""
    try:
        html_file = Path("./static/documents.html")
        if html_file.exists():
            with open(html_file, "r", encoding="utf-8") as f:
                return HTMLResponse(content=f.read())
        else:
            return HTMLResponse(content="<h1>Страница не найдена</h1>", status_code=404)
    except Exception as e:
        logging.error(f"Error serving documents page: {e}")
        return HTMLResponse(content=f"<h1>Ошибка: {str(e)}</h1>", status_code=500)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создаем таблицы при запуске
create_tables()

# Загружаем правила
RULES_PATH = os.path.join(os.path.dirname(__file__), "rules.json")

def load_rules():
    """Загружает правила из rules.json (абсолютный путь)"""
    try:
        with open(RULES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # Возвращаем базовые правила если файл не найден
        return {
            "blacklist_domains": [],
            "whitelist_domains": [],
            "suspicious_keywords": [],
            "trusted_domains": [],
            "suspicious_tlds": [],
            "http_allowlist": [] # Добавляем http_allowlist
        }

rules = load_rules()

def save_rules(rules_data: dict):
    """Сохраняет правила в rules.json (абсолютный путь)"""
    try:
        with open(RULES_PATH, "w", encoding="utf-8") as f:
            json.dump(rules_data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logging.error(f"Error saving rules: {e}")
        return False

def load_payment_rules():
    try:
        with open("rules/payment_rules.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"weights": {}, "threshold_warn": 0.6, "threshold_block": 0.85}

payment_rules = load_payment_rules()

# Настройки автосканирования (сохраняем в файл)
AUTO_SCAN_CONFIG_FILE = "auto_scan_config.json"

def load_auto_scan_config():
    """Загружает настройки автосканирования"""
    try:
        with open(AUTO_SCAN_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # По умолчанию автосканирование включено
        default_config = {"enabled": True}
        save_auto_scan_config(default_config)
        return default_config

def save_auto_scan_config(config: dict):
    """Сохраняет настройки автосканирования"""
    try:
        with open(AUTO_SCAN_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logging.error(f"Error saving auto-scan config: {e}")
        return False

# Pydantic модели
class URLRequest(BaseModel):
    url: str

class URLResponse(BaseModel):
    action: str  # allow, warn, block
    score: float  # 0-1
    reason: str
    incident_id: Optional[int] = None

class IncidentResponse(BaseModel):
    id: int
    url: str
    action: str
    score: float
    reason: Optional[str]
    timestamp: str

def analyze_url(url: str) -> dict:
    """Анализирует URL и возвращает результат проверки"""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        path = parsed.path.lower()
        full_url = url.lower()
        scheme = parsed.scheme.lower()

        # ВАЖНО: Проверка на белый список доменов должна быть ПЕРВОЙ (высший приоритет)
        # Если домен в whitelist, пропускаем его независимо от всех других проверок
        whitelist_domains = rules.get("whitelist_domains", [])
        for whitelisted in whitelist_domains:
            whitelisted_lower = whitelisted.lower().strip()
            # Проверяем точное совпадение или что домен заканчивается на whitelisted домен
            if domain == whitelisted_lower or domain.endswith('.' + whitelisted_lower):
                return {
                    "action": "allow",
                    "score": 0.05,
                    "reason": f"Домен в белом списке (разрешен): {whitelisted}"
                }
        
        # Блокируем незашифрованные HTTP-сайты (кроме localhost/127.0.0.1 и явного allowlist)
        # Но только если домен НЕ в whitelist (уже проверили выше)
        http_allowlist = set(rules.get("http_allowlist", []))
        allowed_http_hosts = ("localhost", "127.", "0.0.0.0")
        if scheme == "http":
            is_local = domain.startswith(allowed_http_hosts[0]) or domain.startswith(allowed_http_hosts[1]) or domain.startswith(allowed_http_hosts[2])
            if (not is_local) and (domain not in http_allowlist):
                return {
                    "action": "block",
                    "score": 0.92,
                    "reason": "Незащищенный протокол HTTP"
                }
        
        # Проверка на доверенные домены (низкий риск)
        if domain in rules.get("trusted_domains", []):
            return {
                "action": "allow",
                "score": 0.05,
                "reason": "Доверенный домен"
            }
        
        # Проверка на черный список доменов
        for blacklisted in rules.get("blacklist_domains", []):
            if blacklisted.lower() in domain:
                return {
                    "action": "block",
                    "score": 0.99,
                    "reason": f"Домен в черном списке: {blacklisted}"
                }
        
        # Проверка на подозрительные TLD
        for suspicious_tld in rules.get("suspicious_tlds", []):
            if domain.endswith(suspicious_tld.lower()):
                return {
                    "action": "warn",
                    "score": 0.7,
                    "reason": f"Подозрительный домен верхнего уровня: {suspicious_tld}"
                }
        
        # Проверка на подозрительные ключевые слова
        suspicious_count = 0
        found_keywords = []
        
        for keyword in rules.get("suspicious_keywords", []):
            if keyword.lower() in full_url:
                suspicious_count += 1
                found_keywords.append(keyword)
        
        if suspicious_count > 0:
            score = min(0.3 + (suspicious_count * 0.2), 0.9)
            return {
                "action": "warn" if score < 0.8 else "block",
                "score": score,
                "reason": f"Найдены подозрительные ключевые слова: {', '.join(found_keywords)}"
            }
        
        # Проверка на подозрительные паттерны
        suspicious_patterns = [
            "bit.ly", "tinyurl", "short.link",
            "free-", "win-", "prize-", "money-",
            "verify", "confirm", "urgent"
        ]
        
        pattern_matches = []
        for pattern in suspicious_patterns:
            if pattern in full_url:
                pattern_matches.append(pattern)
        
        if pattern_matches:
            return {
                "action": "warn",
                "score": 0.6,
                "reason": f"Подозрительные паттерны: {', '.join(pattern_matches)}"
            }
        
        # Если ничего подозрительного не найдено (базовый низкий риск)
        return {
            "action": "allow",
            "score": 0.1,
            "reason": "URL выглядит безопасно"
        }
        
    except Exception as e:
        return {
            "action": "warn",
            "score": 0.5,
            "reason": f"Ошибка при анализе URL: {str(e)}"
        }

# HELPER: Telegram auto-report (чтобы не дублировать в ручном и авто)
def send_tg_auto_report(domain, reason, incident_id=None, ts=None):
    import requests as py_requests
    from datetime import datetime
    TELEGRAM_BOT_TOKEN = "7972590264:AAFvTfbFqyaBS1lLK5W6EWrPEsVh5-KAM58"
    TELEGRAM_CHAT_ID = "-1003297580651"
    msg = f"\u26a0\ufe0f <b>Автожалоба на опасный сайт (AI/HTTP)</b>\n---\n<b>Домен:</b> <code>{domain}</code>\n<b>Причина:</b> {reason}\n<b>ID инцидента:</b> {incident_id or '-'}\n<b>Время:</b> {ts or datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    send_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": msg,
        "parse_mode": "HTML"
    }
    try:
        py_requests.post(send_url, json=payload, timeout=10)
    except Exception:
        pass

@app.post("/v1/check/url", response_model=URLResponse)
async def check_url(request: URLRequest, db: Session = Depends(get_db)):
    """Проверяет URL на фишинг и мошенничество"""
    
    # Перезагружаем правила для использования актуального blacklist
    global rules
    rules = load_rules()
    
    # Анализируем URL
    analysis = analyze_url(request.url)
    
    # Сохраняем инцидент в базу данных
    incident = Incident(
        url=request.url,
        action=analysis["action"],
        score=analysis["score"],
        reason=analysis["reason"],
        timestamp=datetime.now()
    )
    
    db.add(incident)
    db.commit()
    db.refresh(incident)

    from urllib.parse import urlparse
    parsed = urlparse(request.url)
    domain = parsed.netloc.lower()

    def format_ai_report(ai):
        block = []
        block.append(f"▶️ <b>Риск по ИИ:</b> <b>{ai.get('risk')}</b>")
        if ai.get('provider'):
            block.append(f"<b>Провайдер анализа:</b> {ai.get('provider')}")
        reasons = ai.get('reasons') or []
        if reasons:
            block.append("<b>Причины (ИИ):</b>")
            for idx, r in enumerate(reasons, 1):
                block.append(f"    {idx}) {r}")
        return '\n'.join(block)

    if analysis["action"] == "block":
        # 1. Если домена нет в rules['blacklist_domains'] — добавить его автоматически
        blacklist = rules.get("blacklist_domains", [])
        is_new_blacklisted = False
        if domain not in blacklist:
            blacklist.append(domain)
            rules["blacklist_domains"] = blacklist
            save_rules(rules)
            is_new_blacklisted = True
        # 2. Авто-жалоба/подробный отчет только при первом добавлении домена в blacklist
        if is_new_blacklisted:
            # AI-анализ
            ai_report = analyze_urls_with_llm([request.url])
            ai = ai_report["items"][0] if ai_report and ai_report.get("items") else {}
            ai_block = format_ai_report(ai)
            matched = []
            # Попытаться выделить ключевые слова блокировки из анализа
            # Найденные подозрительные tld / keywords из analysis['reason']
            if "ключевые слова" in analysis["reason"] or "паттерны" in analysis["reason"]:
                matched.append(f"⚠️ {analysis['reason']}")
            if "tld" in analysis["reason"]:
                matched.append(f"⚠️ {analysis['reason']}")
            # Форматируем для удобства госорганов и силовых ведомств
            msg = (
                f"\u26a0\ufe0f <b>Детальный отчет: Фишинговый/Опасный сайт заблокирован</b>\n"
                f"---\n"
                f"<b>Дата и время:</b> {incident.timestamp.strftime('%Y-%m-%d %H:%M:%S')}\n"
                f"<b>Исходный URL:</b> <code>{request.url}</code>\n"
                f"<b>Домен (netloc):</b> <code>{domain}</code>\n"
                f"<b>Статус:</b> <b>Заблокирован</b>\n"
                f"<b>ID инцидента:</b> {incident.id}\n"
                f"<b>Уверенность (score):</b> {analysis['score'] * 100:.1f}%\n"
                f"<b>Причина детектирования/блокировки:</b> {analysis['reason']}\n"
                + (f"<b>Обнаружено паттернов/keywords:</b>\n" + '\n'.join(matched) if matched else "") +
                f"\n<b>ИИ-Анализ сайта:</b>\n{ai_block}\n"
                "---\nКонтакт: @your_admin_for_cyber (бот) | PhishGuard\n"
            )
            import requests as py_requests
            TELEGRAM_BOT_TOKEN = "7972590264:AAFvTfbFqyaBS1lLK5W6EWrPEsVh5-KAM58"
            TELEGRAM_CHAT_ID = "-1003297580651"
            send_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": TELEGRAM_CHAT_ID,
                "text": msg,
                "parse_mode": "HTML"
            }
            try:
                py_requests.post(send_url, json=payload, timeout=15)
            except Exception:
                pass
        else:
            # Если домен уже есть в ЧС — как раньше, но не дублировать report в TG каждый раз
            today_str = datetime.now().strftime('%Y-%m-%d')
            exists = db.query(Incident).filter(Incident.action == "block").filter(Incident.url.contains(domain)).filter(Incident.timestamp >= today_str).first()
            if not exists:
                send_tg_auto_report(domain=domain, reason=analysis["reason"], incident_id=incident.id, ts=incident.timestamp.strftime('%Y-%m-%d %H:%M:%S'))

    return URLResponse(
        action=analysis["action"],
        score=analysis["score"],
        reason=analysis["reason"],
        incident_id=incident.id
    )

@app.get("/incidents", response_model=List[IncidentResponse])
async def get_incidents(
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Возвращает список инцидентов"""
    
    query = db.query(Incident)
    
    if action:
        query = query.filter(Incident.action == action)
    
    incidents = query.order_by(Incident.timestamp.desc()).offset(offset).limit(limit).all()
    
    return [IncidentResponse(**incident.to_dict()) for incident in incidents]

@app.get("/incidents/stats")
async def get_incident_stats(db: Session = Depends(get_db)):
    """Возвращает статистику инцидентов"""
    
    total = db.query(Incident).count()
    blocked = db.query(Incident).filter(Incident.action == "block").count()
    warned = db.query(Incident).filter(Incident.action == "warn").count()
    allowed = db.query(Incident).filter(Incident.action == "allow").count()
    
    return {
        "total_incidents": total,
        "blocked": blocked,
        "warned": warned,
        "allowed": allowed,
        "block_rate": round(blocked / total * 100, 2) if total > 0 else 0,
        "warn_rate": round(warned / total * 100, 2) if total > 0 else 0
    }

@app.get("/health")
async def health_check():
    """Проверка здоровья API"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.delete("/incidents/clear")
async def clear_incidents(db: Session = Depends(get_db)):
    """Очищает все incidents из базы данных"""
    try:
        count = db.query(Incident).count()
        db.query(Incident).delete()
        db.commit()
        return {
            "success": True,
            "deleted": count,
            "message": f"Удалено {count} записей из базы данных"
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка очистки базы данных: {str(e)}")


@app.post("/analyze_payment", response_model=PaymentAnalysisResponse)
async def analyze_payment(req: PaymentAnalysisRequest, db: Session = Depends(get_db)):
    url = req.url or ""
    html_snippet = (req.html_snippet or "")[:30000]
    # Маскируем перед любыми вычислениями/сохранением
    masked = mask_pan(html_snippet)
    html_hash = req.html_hash or sha256_hex(masked)

    # Базовый анализ платежной страницы
    result = analyze_payment_page(url, masked, payment_rules)

    # AI анализ ВСЕГДА выполняется (даже если платежная форма не найдена)
    # Это нужно для анализа сайта на фишинг в целом
    ai_result = None
    try:
        logging.info(f"[PAYMENT] Starting AI analysis for URL: {url}")
        ai_result = analyze_payment_with_ai(url, masked)
        if ai_result:
            logging.info(f"[PAYMENT] AI analysis completed: verdict={ai_result.get('verdict')}, risk_percent={ai_result.get('risk_percent')}, provider={ai_result.get('provider')}")
        else:
            logging.warning(f"[PAYMENT] AI analysis returned None")
    except Exception as e:
        logging.error(f"[PAYMENT] AI analysis failed with exception: {e}", exc_info=True)
        # Продолжаем без AI анализа

    # Объединяем результаты AI с базовым анализом (ВСЕГДА добавляем в explain, даже если вердикт "неизвестно")
    if ai_result:
        # Если AI говорит "опасно", повышаем score (только если вердикт не "неизвестно")
        if ai_result.get("verdict") and ai_result.get("verdict") != "неизвестно" and ai_result.get("verdict") == "опасно":
            risk_percent = ai_result.get("risk_percent", 50)
            # Конвертируем процент в score (0-1)
            ai_score = risk_percent / 100.0
            # Объединяем с существующим score (берем максимум)
            result["score"] = max(result["score"], ai_score)
            result["safe"] = result["score"] < payment_rules.get("threshold_warn", 0.6)
            
            # Добавляем AI риски в reasons если их нет
            ai_risks = ai_result.get("risks", [])
            if ai_risks:
                for risk in ai_risks:
                    if risk and risk not in result["reasons"]:
                        result["reasons"].append(f"ai_detected: {risk}")
        
        # Добавляем AI объяснение в explain (ВСЕГДА, даже если платежная форма не найдена или вердикт "неизвестно")
        if "explain" not in result:
            result["explain"] = {}
        result["explain"]["ai_analysis"] = {
            "verdict": ai_result.get("verdict", "неизвестно"),
            "risk_percent": ai_result.get("risk_percent", 0),
            "explanation": ai_result.get("explanation", ""),
            "risks": ai_result.get("risks", []),
            "connection_status": ai_result.get("connection_status", "неизвестно"),
            "address_check": ai_result.get("address_check", "неизвестно"),
            "redirects": ai_result.get("redirects", "неизвестно"),
            "safety_points": ai_result.get("safety_points", []),
            "conclusion": ai_result.get("conclusion", ""),
            "provider": ai_result.get("provider", "none")
        }
    else:
        # Если AI анализ не выполнен, все равно добавляем пустую структуру для отображения ошибки
        if "explain" not in result:
            result["explain"] = {}
        result["explain"]["ai_analysis"] = None

    parsed = urlparse(url)
    domain = parsed.netloc.lower() if parsed and parsed.netloc else None

    # Сохраняем запись (без сырого html)
    record = PaymentCheck(
        request_id=req.request_id,
        url=url,
        domain=domain,
        safe=1 if result["safe"] else 0,
        score=result["score"],
        reasons=json.dumps(result["reasons"], ensure_ascii=False),
        meta=json.dumps(req.meta or {}, ensure_ascii=False),
        html_hash=html_hash,
        timestamp=datetime.now()
    )
    db.add(record)
    db.commit()

    return PaymentAnalysisResponse(
        request_id=req.request_id,
        safe=result["safe"],
        score=result["score"],
        reasons=result["reasons"],
        explain=result["explain"],
    )


class SecretScanRequest(BaseModel):
    url: str
    use_pinkerton: bool | None = True


@app.post("/v1/scan/secrets")
async def scan_secrets(req: SecretScanRequest):
    """Scan the given URL for secrets inside linked JavaScript files.
    Returns a compact report with findings.
    """
    try:
        report = scan_url_for_js_secrets(req.url)
        if req.use_pinkerton:
            report["pinkerton"] = run_pinkerton(req.url)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Secret scan error: {str(e)}")


class AiScanRequest(BaseModel):
    urls: List[str]


@app.post("/v1/ai/scan")
async def ai_scan(req: AiScanRequest):
    """LLM-based risk analysis using OpenRouter (set OPENROUTER_API_KEY)."""
    try:
        result = analyze_urls_with_llm(req.urls)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI scan error: {str(e)}")


class VulnScanRequest(BaseModel):
    url: str


class VulnScanResponse(BaseModel):
    status: str
    target: str
    output: str


class GobusterScanRequest(BaseModel):
    url: str
    wordlist: Optional[str] = None

class JSDirbusterScanRequest(BaseModel):
    url: str
    wordlist: Optional[str] = None


def _validate_scan_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Nikto поддерживает только http/https URL.")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Некорректный URL для сканирования.")
    return raw_url.strip()


def _ensure_nikto_available() -> str:
    """Return path to perl binary and ensure Nikto files exist."""
    if not NIKTO_PROGRAM.exists():
        raise HTTPException(
            status_code=500,
            detail="Nikto не найден. Выполните git clone https://github.com/sullo/nikto.git Agro_Phish/tools/nikto"
        )
    perl_bin = shutil.which("perl")
    if not perl_bin:
        raise HTTPException(status_code=500, detail="Perl не установлен, Nikto требует perl.")
    return perl_bin


def _ensure_gobuster_available(wordlist: Optional[str]) -> tuple[str, str]:
    """
    Ensure gobuster binary and wordlist exist.
    Returns (binary_path, wordlist_path).
    """
    if not GOBUSTER_BIN.exists():
        raise HTTPException(
            status_code=500,
            detail="Gobuster не найден. Установите бинарь в Agro_Phish/tools/gobuster/gobuster"
        )
    # Используем папку wordlists, если wordlist не указан или если указано только имя файла
    if not wordlist:
        wl_candidates = [
            BASE_DIR / "extension" / "tools" / "wordlists" / "directory-list-2.3-small.txt",
            BASE_DIR / "wordlists" / "common.txt",
            BASE_DIR / "tools" / "gobuster" / "wordlist.txt"
        ]
        for wl_path in wl_candidates:
            if wl_path.exists():
                wl = str(wl_path)
                break
        else:
            raise HTTPException(
                status_code=500,
                detail="Wordlist не найден. Проверьте extension/tools/wordlists/"
            )
    else:
        # Если передан абсолютный путь или путь относительно cwd
        if Path(wordlist).exists():
            wl = wordlist
        else:
            # Пробуем найти в папке wordlists расширения
            wl_ext_path = BASE_DIR / "extension" / "tools" / "wordlists" / Path(wordlist).name
            if wl_ext_path.exists():
                wl = str(wl_ext_path)
            else:
                 # Пробуем старые пути
                wl_old_path = BASE_DIR / "wordlists" / Path(wordlist).name
                if wl_old_path.exists():
                    wl = str(wl_old_path)
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Wordlist не найден: {wordlist}"
                    )
    return str(GOBUSTER_BIN), wl


def _clean_gobuster_output(raw_output: str, wordlist_path: str, target_url: str) -> str:
    """
    Преобразует вывод Gobuster в структурированный и читабельный формат:
    1. Удаляет ANSI escape codes
    2. Удаляет декоративные линии (=====)
    3. Удаляет строки прогресса
    4. Извлекает полезную информацию
    5. Форматирует в аккуратный вид
    """
    if not raw_output:
        return "Gobuster Scan Summary\n---------------------\nTarget URL: {}\n\nResult:\nNo directories found.".format(target_url)
    
    lines = raw_output.split('\n')
    
    # Получаем имя файла wordlist
    wordlist_filename = Path(wordlist_path).name
    
    # Извлекаем информацию из вывода
    url = target_url
    method = "GET"
    threads = "10"
    wordlist = wordlist_filename
    negative_codes = "301,302,307,308,404"
    exclude_length = "0"
    
    found_directories = []
    parsing_info = False
    parsing_results = False
    
    for line in lines:
        # Удаляем ANSI escape codes
        line = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', line)
        line = line.strip()
        
        # Пропускаем декоративные линии
        if re.match(r'^=+$', line):
            continue
        
        # Пропускаем пустые строки
        if not line:
            continue
        
        # Пропускаем заголовки версии
        if 'Gobuster v' in line or 'by OJ Reeves' in line or 'by Christian Mehlmauer' in line:
            continue
        
        # Пропускаем строки прогресса
        if re.match(r'^Progress:\s*\d+\s*/\s*\d+', line, re.IGNORECASE):
            continue
        if re.match(r'^Progress:\s*', line, re.IGNORECASE):
            continue
        
        # Извлекаем информацию из строк конфигурации
        if '[+] Url:' in line:
            url_match = re.search(r'https?://[^\s]+', line)
            if url_match:
                url = url_match.group(0)
        elif '[+] Method:' in line:
            method_match = re.search(r'GET|POST|PUT|DELETE', line)
            if method_match:
                method = method_match.group(0)
        elif '[+] Threads:' in line:
            threads_match = re.search(r'\d+', line)
            if threads_match:
                threads = threads_match.group(0)
        elif '[+] Wordlist:' in line:
            # Скрываем абсолютный путь
            wordlist_match = re.search(r'([^/\s]+\.txt)', line)
            if wordlist_match:
                wordlist = wordlist_match.group(1)
        elif '[+] Negative Status codes:' in line or 'Negative Status codes:' in line:
            codes_match = re.search(r'(\d+(?:,\d+)*)', line)
            if codes_match:
                negative_codes = codes_match.group(1)
        elif '[+] Exclude Length:' in line or 'Exclude Length:' in line:
            length_match = re.search(r'(\d+)', line)
            if length_match:
                exclude_length = length_match.group(1)
        
        # Пропускаем служебные строки
        if 'Starting gobuster' in line or 'Finished' in line:
            continue
        
        # Извлекаем найденные директории
        # Форматы: /path/to/dir (Status: 200) [Size: 1234]
        # или просто /path/to/dir
        if re.match(r'^/', line):
            # Это найденная директория
            found_directories.append(line)
        elif re.search(r'\(Status:\s*\d+\)', line):
            # Строка с результатом (может быть без начального /)
            found_directories.append(line)
    
    # Формируем структурированный вывод
    result_lines = [
        "Gobuster Scan Summary",
        "---------------------",
        f"Target URL: {url}",
        f"Wordlist: {wordlist}",
        f"Threads: {threads}",
        f"Ignored Status Codes: {negative_codes}",
        f"Ignored Length: {exclude_length}",
        "",
        "Result:"
    ]
    
    if found_directories:
        result_lines.append("")
        for dir_line in found_directories:
            # Очищаем строку от лишнего
            cleaned_dir = re.sub(r'\s+', ' ', dir_line).strip()
            if cleaned_dir:
                result_lines.append(cleaned_dir)
    else:
        result_lines.append("No directories found.")
    
    return '\n'.join(result_lines)


@app.post("/v1/vuln/nikto", response_model=VulnScanResponse)
async def nikto_vuln_scan(req: VulnScanRequest):
    """Запускает локальный Nikto против указанного URL и возвращает stdout/stderr."""
    target = _validate_scan_url(req.url)
    perl_bin = _ensure_nikto_available()

    cmd = [
        perl_bin,
        str(NIKTO_PROGRAM),
        "-ask", "no",
        "-maxtime", "30s",
        "-timeout", "10",
        "-h", target,
    ]

    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(NIKTO_PROGRAM.parent),
            timeout=60
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Nikto scan timed out after 60s")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nikto execution error: {str(e)}")

    output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
    output = output.strip() or "Nikto завершил работу без вывода."
    if len(output) > 12000:
        output = output[:12000] + "\n...output truncated..."

    status = "ok" if completed.returncode == 0 else f"error:{completed.returncode}"
    return VulnScanResponse(status=status, target=target, output=output)


@app.post("/v1/vuln/gobuster", response_model=VulnScanResponse)
async def gobuster_dir_scan(req: GobusterScanRequest):
    """Запускает Gobuster dir scan против указанного URL."""
    target = _validate_scan_url(req.url)
    bin_path, wordlist = _ensure_gobuster_available(req.wordlist)

    # Используем только status-codes-blacklist для исключения нежелательных кодов
    # Blacklist по умолчанию содержит 404, добавляем redirect коды (301, 302, 307)
    # Исключаем пустые ответы через exclude-length
    # НЕ используем одновременно --status-codes и --status-codes-blacklist
    cmd = [
        bin_path,
        "dir",
        "--url", target,
        "--wordlist", wordlist,
        "--timeout", "10s",
        "--delay", "0s",
        "--no-color",
        "--threads", "10",
        "--status-codes-blacklist", "301,302,307,308,404",
        "--exclude-length", "0"
    ]

    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(Path(bin_path).parent),
            timeout=120
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Gobuster scan timed out after 120s")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gobuster execution error: {str(e)}")

    # Получаем сырой вывод
    raw_output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
    
    # Очищаем и форматируем вывод
    cleaned_output = _clean_gobuster_output(raw_output, wordlist, target)
    
    # Обрезаем слишком длинный вывод
    if len(cleaned_output) > 12000:
        cleaned_output = cleaned_output[:12000] + "\n...output truncated..."
    
    if not cleaned_output.strip():
        cleaned_output = "Gobuster Scan Summary\n---------------------\nTarget URL: {}\n\nResult:\nNo directories found.".format(target)
    
    # Gobuster может возвращать 1, если ничего не найдено, но вывод все равно полезен
    # Считаем успешным, если есть вывод (не пустой) или код возврата 0
    if completed.returncode == 0 or (completed.returncode == 1 and cleaned_output.strip()):
        status = "ok"
    else:
        status = f"error:{completed.returncode}"
    
    return VulnScanResponse(status=status, target=target, output=cleaned_output)


JS_DIRBUSTER_ROOT = BASE_DIR / "tools" / "jsdirbuster"

def _ensure_jsdirbuster_available(wordlist: Optional[str]) -> tuple[str, str]:
    """Ensure JSDirbuster files exist."""
    if not JS_DIRBUSTER_ROOT.exists():
        raise HTTPException(
            status_code=500,
            detail="JSDirbuster не найден. Установите в Agro_Phish/tools/jsdirbuster"
        )
    js_file = JS_DIRBUSTER_ROOT / "jsdirbuster.js"
    if not js_file.exists():
        # Попробуем найти любой .js файл в директории
        js_files = list(JS_DIRBUSTER_ROOT.glob("*.js"))
        if not js_files:
            raise HTTPException(
                status_code=500,
                detail="JSDirbuster.js не найден"
            )
        js_file = js_files[0]
    wl = wordlist or str(BASE_DIR / "tools" / "gobuster" / "wordlist.txt")
    if not Path(wl).exists():
        raise HTTPException(
            status_code=500,
            detail=f"Wordlist не найден: {wl}"
        )
    return str(js_file), wl


@app.post("/v1/vuln/jsdirbuster", response_model=VulnScanResponse)
async def jsdirbuster_scan(req: JSDirbusterScanRequest):
    """Запускает JSDirbuster scan против указанного URL."""
    target = _validate_scan_url(req.url)
    js_file, wordlist = _ensure_jsdirbuster_available(req.wordlist)
    
    node_bin = shutil.which("node")
    if not node_bin:
        raise HTTPException(status_code=500, detail="Node.js не установлен, JSDirbuster требует node.")
    
    cmd = [
        node_bin,
        js_file,
        "-u", target,
        "-w", wordlist,
        "-t", "10"
    ]
    
    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(JS_DIRBUSTER_ROOT),
            timeout=120
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="JSDirbuster scan timed out after 120s")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JSDirbuster execution error: {str(e)}")
    
    output = (completed.stdout or "") + ("\n" + completed.stderr if completed.stderr else "")
    output = output.strip() or "JSDirbuster завершил работу без вывода."
    if len(output) > 12000:
        output = output[:12000] + "\n...output truncated..."
    
    status = "ok" if completed.returncode == 0 else f"error:{completed.returncode}"
    return VulnScanResponse(status=status, target=target, output=output)


class FullAuditRequest(BaseModel):
    url: str


@app.post("/v1/ai/full-audit")
async def full_audit(req: FullAuditRequest):
    """Полный анти-фишинговый аудит сайта с детальным анализом всех аспектов."""
    try:
        result = analyze_url_full_audit(req.url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Full audit error: {str(e)}")


# ==================== Document Analysis API Endpoints ====================

@app.post("/v1/document/analyze")
async def analyze_document_endpoint(file: UploadFile = File(...)):
    """Анализ документа (PDF, DOC, DOCX) на банковские данные и фишинг"""
    try:
        # Проверяем тип файла
        content_type = file.content_type or ""
        file_ext = file.filename.split('.')[-1].lower() if file.filename else ""
        
        if file_ext not in ['pdf', 'doc', 'docx']:
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы PDF, DOC и DOCX")
        
        # Читаем содержимое файла
        file_content = await file.read()
        
        if len(file_content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="Размер файла не должен превышать 10MB")
        
        # Определяем MIME тип
        mime_type = content_type
        if not mime_type:
            if file_ext == 'pdf':
                mime_type = 'application/pdf'
            elif file_ext == 'doc':
                mime_type = 'application/msword'
            elif file_ext == 'docx':
                mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        
        # Анализируем документ
        result = analyze_document(file_content, file.filename or "unknown", mime_type)
        
        # Возвращаем только ID анализа (полные данные получаем через GET)
        return {
            "analysis_id": result["analysis_id"],
            "status": "success",
            "message": "Документ успешно проанализирован"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Document analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка анализа документа: {str(e)}")


@app.get("/v1/document/analysis/{analysis_id}")
async def get_document_analysis(analysis_id: str):
    """Получить результат анализа документа по ID"""
    try:
        result = get_analysis(analysis_id)
        if not result:
            raise HTTPException(status_code=404, detail="Анализ не найден")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения анализа: {str(e)}")


# ==================== Document Upload & Share API Endpoints ====================

# Создаем директорию для загруженных документов
DOCUMENTS_DIR = Path("./uploads/documents")
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/v1/document/upload")
async def upload_document(file: UploadFile = File(...)):
    """Загружает документ и возвращает публичную ссылку для доступа"""
    try:
        # Проверяем тип файла
        content_type = file.content_type or ""
        file_ext = file.filename.split('.')[-1].lower() if file.filename else ""
        
        if file_ext not in ['pdf', 'doc', 'docx']:
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы PDF, DOC и DOCX")
        
        # Читаем содержимое файла
        file_content = await file.read()
        
        if len(file_content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="Размер файла не должен превышать 10MB")
        
        # Генерируем уникальный ID для документа
        doc_id = str(uuid.uuid4())
        
        # Сохраняем оригинальное имя файла
        original_filename = file.filename or f"document.{file_ext}"
        
        # Сохраняем файл с уникальным ID
        file_path = DOCUMENTS_DIR / f"{doc_id}.{file_ext}"
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        # Создаем метаданные документа
        metadata = {
            "doc_id": doc_id,
            "original_filename": original_filename,
            "file_ext": file_ext,
            "file_size": len(file_content),
            "content_type": content_type or f"application/{file_ext}",
            "uploaded_at": datetime.now().isoformat()
        }
        
        # Сохраняем метаданные
        metadata_path = DOCUMENTS_DIR / f"{doc_id}.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        # Генерируем публичную ссылку
        # В продакшене используйте реальный домен
        base_url = os.getenv("BASE_URL", "http://localhost:8002")
        share_url = f"{base_url}/v1/document/share/{doc_id}"
        
        logging.info(f"Document uploaded: {original_filename} -> {doc_id}")
        
        return {
            "status": "success",
            "doc_id": doc_id,
            "share_url": share_url,
            "original_filename": original_filename,
            "file_size": len(file_content),
            "message": "Документ успешно загружен"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Document upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки документа: {str(e)}")


def sanitize_filename(filename: str) -> str:
    """Очищает имя файла от эмодзи и специальных символов для безопасного использования в заголовках"""
    if not filename:
        return "document"
    
    # Удаляем эмодзи (Unicode символы в диапазоне эмодзи)
    # Эмодзи обычно в диапазонах: U+1F300–U+1F9FF, U+2600–U+26FF, U+2700–U+27BF
    sanitized = re.sub(r'[\U0001F300-\U0001F9FF\U00002600-\U000026FF\U00002700-\U000027BF]', '', filename)
    
    # Удаляем другие небезопасные символы, но оставляем буквы (включая кириллицу), цифры, пробелы, дефисы, подчеркивания, точки
    # Используем более широкий паттерн для поддержки кириллицы
    sanitized = re.sub(r'[^\w\s\-_\.]', '', sanitized, flags=re.UNICODE)
    
    # Убираем множественные пробелы
    sanitized = re.sub(r'\s+', '_', sanitized)
    
    # Убираем пробелы в начале и конце
    sanitized = sanitized.strip()
    
    # Если имя пустое, используем дефолтное
    if not sanitized:
        sanitized = "document"
    
    # Ограничиваем длину имени файла
    if len(sanitized) > 200:
        name, ext = os.path.splitext(sanitized)
        sanitized = name[:200] + ext
    
    return sanitized

@app.get("/v1/document/share/{doc_id}")
async def share_document(doc_id: str):
    """Открыть документ по публичной ссылке (отображается в браузере)"""
    try:
        # Проверяем существование метаданных
        metadata_path = DOCUMENTS_DIR / f"{doc_id}.json"
        if not metadata_path.exists():
            raise HTTPException(status_code=404, detail="Документ не найден")
        
        # Загружаем метаданные
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        
        # Проверяем существование файла
        file_path = DOCUMENTS_DIR / f"{doc_id}.{metadata['file_ext']}"
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Файл документа не найден")
        
        # Определяем MIME тип
        mime_types = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        media_type = mime_types.get(metadata['file_ext'], 'application/octet-stream')
        
        # Очищаем имя файла от эмодзи и специальных символов
        original_filename = metadata.get('original_filename', 'document')
        safe_filename = sanitize_filename(original_filename)
        
        # Если расширение отсутствует, добавляем его
        if not safe_filename.endswith(f".{metadata['file_ext']}"):
            safe_filename = f"{safe_filename}.{metadata['file_ext']}"
        
        # Кодируем имя файла для заголовка (RFC 2231)
        # Используем quote для правильного кодирования UTF-8
        # quote работает со строками и автоматически кодирует их в UTF-8
        encoded_filename = quote(safe_filename, safe='')
        
        # Возвращаем файл для отображения в браузере (inline вместо attachment)
        # Для PDF это откроет его прямо в браузере
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=safe_filename,
            headers={
                "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
                "Content-Type": media_type,
                "X-Content-Type-Options": "nosniff"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error sharing document: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения документа: {str(e)}")


@app.get("/v1/document/info/{doc_id}")
async def get_document_info(doc_id: str):
    """Получить информацию о документе (без скачивания)"""
    try:
        metadata_path = DOCUMENTS_DIR / f"{doc_id}.json"
        if not metadata_path.exists():
            raise HTTPException(status_code=404, detail="Документ не найден")
        
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        
        # Не возвращаем полный путь к файлу, только публичную информацию
        base_url = os.getenv("BASE_URL", "http://localhost:8002")
        share_url = f"{base_url}/v1/document/share/{doc_id}"
        
        return {
            "doc_id": doc_id,
            "share_url": share_url,
            "original_filename": metadata['original_filename'],
            "file_size": metadata['file_size'],
            "uploaded_at": metadata['uploaded_at']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting document info: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения информации: {str(e)}")


@app.delete("/v1/documents/clear")
async def clear_all_documents():
    """Удалить все загруженные документы"""
    try:
        deleted_count = 0
        deleted_size = 0
        
        if DOCUMENTS_DIR.exists():
            # Удаляем все файлы документов и метаданные
            for json_file in DOCUMENTS_DIR.glob("*.json"):
                try:
                    # Читаем метаданные для получения размера файла
                    with open(json_file, "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                    
                    doc_id = metadata.get('doc_id', json_file.stem)
                    file_ext = metadata.get('file_ext', '')
                    file_size = metadata.get('file_size', 0)
                    
                    # Удаляем файл документа
                    file_path = DOCUMENTS_DIR / f"{doc_id}.{file_ext}"
                    if file_path.exists():
                        deleted_size += file_size
                        file_path.unlink()
                    
                    # Удаляем метаданные
                    json_file.unlink()
                    deleted_count += 1
                    
                except Exception as e:
                    logging.warning(f"Error deleting document {json_file}: {e}")
                    continue
        
        logging.info(f"Cleared {deleted_count} documents, freed {deleted_size / (1024*1024):.2f} MB")
        
        return {
            "status": "success",
            "deleted_count": deleted_count,
            "deleted_size_bytes": deleted_size,
            "deleted_size_mb": round(deleted_size / (1024 * 1024), 2),
            "message": f"Удалено {deleted_count} документов"
        }
        
    except Exception as e:
        logging.error(f"Error clearing documents: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка удаления документов: {str(e)}")


@app.get("/v1/documents/list")
async def list_documents():
    """Получить список всех загруженных документов"""
    try:
        documents = []
        base_url = os.getenv("BASE_URL", "http://localhost:8002")
        
        # Сканируем директорию с документами
        if DOCUMENTS_DIR.exists():
            for json_file in DOCUMENTS_DIR.glob("*.json"):
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        metadata = json.load(f)
                    
                    doc_id = metadata.get('doc_id', json_file.stem)
                    share_url = f"{base_url}/v1/document/share/{doc_id}"
                    
                    documents.append({
                        "doc_id": doc_id,
                        "share_url": share_url,
                        "original_filename": metadata.get('original_filename', 'unknown'),
                        "file_size": metadata.get('file_size', 0),
                        "file_ext": metadata.get('file_ext', ''),
                        "uploaded_at": metadata.get('uploaded_at', '')
                    })
                except Exception as e:
                    logging.warning(f"Error reading document metadata {json_file}: {e}")
                    continue
        
        # Сортируем по дате загрузки (новые первыми)
        documents.sort(key=lambda x: x.get('uploaded_at', ''), reverse=True)
        
        return {
            "total": len(documents),
            "documents": documents
        }
        
    except Exception as e:
        logging.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения списка документов: {str(e)}")


# ==================== Invoice Verification API Endpoints ====================

@app.post("/v1/invoice/verify")
async def verify_invoice_endpoint(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """ИИ-проверка счёта-фактуры на подлинность и соответствие"""
    try:
        # Проверяем тип файла
        content_type = file.content_type or ""
        file_ext = file.filename.split('.')[-1].lower() if file.filename else ""
        
        if file_ext not in ['pdf', 'xml', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx']:
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы PDF, XML, JPG, PNG, DOC, DOCX, XLS, XLSX")
        
        # Читаем содержимое файла
        file_content = await file.read()
        
        if len(file_content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="Размер файла не должен превышать 10MB")
        
        # Определяем MIME тип
        mime_type = content_type
        if not mime_type:
            if file_ext == 'pdf':
                mime_type = 'application/pdf'
            elif file_ext == 'xml':
                mime_type = 'application/xml'
            elif file_ext in ['jpg', 'jpeg']:
                mime_type = 'image/jpeg'
            elif file_ext == 'png':
                mime_type = 'image/png'
            elif file_ext == 'doc':
                mime_type = 'application/msword'
            elif file_ext == 'docx':
                mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            elif file_ext == 'xls':
                mime_type = 'application/vnd.ms-excel'
            elif file_ext in ['xlsx', 'xlsm']:
                mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        
        # Анализируем счёт-фактуру
        result = verify_invoice(file_content, file.filename or "unknown", mime_type)
        
        # Сохраняем результат в БД для audit trail
        doc_hash = result.get("audit", {}).get("docHash", "").replace("sha256:", "")
        invoice_check = InvoiceCheck(
            analysis_id=result["analysis_id"],
            filename=file.filename or "unknown",
            doc_hash=doc_hash,
            status=result["status"],
            score=result["score"],
            invoice_data=json.dumps(result.get("invoice", {}), ensure_ascii=False),
            checks=json.dumps(result.get("checks", []), ensure_ascii=False),
            reasons=json.dumps(result.get("reasons", []), ensure_ascii=False),
            recommendations=json.dumps(result.get("recommendations", []), ensure_ascii=False),
            timestamp=datetime.now()
        )
        db.add(invoice_check)
        db.commit()
        db.refresh(invoice_check)
        
        logging.info(f"Invoice check saved to DB: analysis_id={result['analysis_id']}, status={result['status']}, score={result['score']}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Invoice verification error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка проверки счёта-фактуры: {str(e)}")


@app.get("/v1/invoice/analysis/{analysis_id}")
async def get_invoice_analysis_endpoint(analysis_id: str, db: Session = Depends(get_db)):
    """Получить результат проверки счёта-фактуры по ID"""
    try:
        # Сначала пробуем получить из БД
        invoice_check = db.query(InvoiceCheck).filter(InvoiceCheck.analysis_id == analysis_id).first()
        if invoice_check:
            return invoice_check.to_dict()
        
        # Fallback к памяти (для обратной совместимости)
        result = get_invoice_analysis(analysis_id)
        if not result:
            raise HTTPException(status_code=404, detail="Анализ не найден")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting invoice analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения анализа: {str(e)}")


@app.get("/v1/invoice/history")
async def get_invoice_history(
    limit: int = 100,
    offset: int = 0,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Получить историю проверок счётов-фактур"""
    try:
        query = db.query(InvoiceCheck)
        
        # Фильтр по статусу
        if status:
            query = query.filter(InvoiceCheck.status == status)
        
        # Сортировка по дате (новые сначала)
        query = query.order_by(InvoiceCheck.timestamp.desc())
        
        # Пагинация
        total = query.count()
        checks = query.offset(offset).limit(limit).all()
        
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "checks": [check.to_dict() for check in checks]
        }
    except Exception as e:
        logging.error(f"Error getting invoice history: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения истории: {str(e)}")


@app.get("/v1/invoice/stats")
async def get_invoice_stats(db: Session = Depends(get_db)):
    """Получить статистику по проверкам счётов-фактур"""
    try:
        total_checks = db.query(InvoiceCheck).count()
        
        # Статистика по статусам
        accepted = db.query(InvoiceCheck).filter(InvoiceCheck.status == "accepted").count()
        suspicious = db.query(InvoiceCheck).filter(InvoiceCheck.status == "suspicious").count()
        rejected = db.query(InvoiceCheck).filter(InvoiceCheck.status == "rejected").count()
        
        # Средний скор
        avg_score = db.query(func.avg(InvoiceCheck.score)).scalar() or 0.0
        
        # Статистика за последние 30 дней
        from datetime import timedelta
        thirty_days_ago = datetime.now() - timedelta(days=30)
        recent_checks = db.query(InvoiceCheck).filter(InvoiceCheck.timestamp >= thirty_days_ago).count()
        
        # Процент автоматических проверок (все проверки автоматические, но можно добавить фильтр по decision)
        auto_approved = db.query(InvoiceCheck).filter(
            InvoiceCheck.status == "accepted",
            InvoiceCheck.decision.is_(None)  # Нет ручного решения
        ).count()
        
        auto_rate = (auto_approved / accepted * 100) if accepted > 0 else 0.0
        
        # Статистика по дубликатам (по doc_hash)
        duplicate_hashes = db.query(
            InvoiceCheck.doc_hash,
            func.count(InvoiceCheck.id).label('count')
        ).group_by(InvoiceCheck.doc_hash).having(func.count(InvoiceCheck.id) > 1).count()
        
        return {
            "total_checks": total_checks,
            "by_status": {
                "accepted": accepted,
                "suspicious": suspicious,
                "rejected": rejected
            },
            "average_score": round(float(avg_score), 2),
            "recent_30_days": recent_checks,
            "auto_approval_rate": round(auto_rate, 2),
            "duplicate_documents": duplicate_hashes,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logging.error(f"Error getting invoice stats: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения статистики: {str(e)}")


# ==================== Admin Panel API Endpoints ====================

class BlacklistDomainRequest(BaseModel):
    domain: str

class WhitelistDomainRequest(BaseModel):
    domain: str

class AutoScanConfigRequest(BaseModel):
    enabled: bool

@app.get("/admin/blacklist")
async def get_blacklist():
    """Возвращает список заблокированных доменов"""
    global rules
    rules = load_rules()  # Перезагружаем правила
    return {
        "domains": rules.get("blacklist_domains", [])
    }

@app.post("/admin/blacklist")
async def add_to_blacklist(req: BlacklistDomainRequest):
    """Добавляет домен в черный список"""
    global rules
    rules = load_rules()  # Перезагружаем правила
    
    domain = req.domain.lower().strip()
    blacklist = rules.get("blacklist_domains", [])
    
    if domain in blacklist:
        raise HTTPException(status_code=400, detail=f"Домен {domain} уже в черном списке")
    
    blacklist.append(domain)
    rules["blacklist_domains"] = blacklist
    
    if not save_rules(rules):
        raise HTTPException(status_code=500, detail="Ошибка сохранения правил")
    
    return {
        "success": True,
        "message": f"Домен {domain} добавлен в черный список",
        "domains": blacklist
    }

@app.delete("/admin/blacklist/{domain}")
async def remove_from_blacklist(domain: str):
    """Удаляет домен из черного списка"""
    from urllib.parse import unquote
    
    global rules
    rules = load_rules()  # Перезагружаем правила
    
    # Декодируем URL-кодированный домен
    domain_decoded = unquote(domain)
    domain_lower = domain_decoded.lower().strip()
    blacklist = list(rules.get("blacklist_domains", []))  # Создаем копию списка
    
    logging.info(f"Attempting to remove domain: {domain_decoded} (lowercase: {domain_lower})")
    logging.info(f"Current blacklist: {blacklist}")
    
    # Ищем точное совпадение (регистронезависимо)
    found_domain = None
    for bl_domain in blacklist:
        if bl_domain.lower().strip() == domain_lower:
            found_domain = bl_domain
            break
    
    if not found_domain:
        # Если точного совпадения нет, пробуем найти частичное совпадение
        for bl_domain in blacklist:
            bl_lower = bl_domain.lower().strip()
            if domain_lower == bl_lower or domain_lower in bl_lower or bl_lower in domain_lower:
                found_domain = bl_domain
                logging.info(f"Found partial match: {bl_domain}")
                break
    
    if not found_domain:
        logging.warning(f"Domain {domain_decoded} not found in blacklist")
        raise HTTPException(status_code=404, detail=f"Домен {domain_decoded} не найден в черном списке")
    
    # Удаляем найденный домен
    blacklist.remove(found_domain)
    rules["blacklist_domains"] = blacklist
    
    logging.info(f"Removed domain: {found_domain}, new blacklist: {blacklist}")
    
    if not save_rules(rules):
        logging.error("Failed to save rules after removing domain")
        raise HTTPException(status_code=500, detail="Ошибка сохранения правил")
    
    return {
        "success": True,
        "message": f"Домен {found_domain} удален из черного списка",
        "domains": blacklist
    }

@app.get("/admin/whitelist")
async def get_whitelist():
    """Возвращает список разрешенных доменов (белый список)"""
    global rules
    rules = load_rules()  # Перезагружаем правила
    return {
        "domains": rules.get("whitelist_domains", [])
    }

@app.post("/admin/whitelist")
async def add_to_whitelist(req: WhitelistDomainRequest):
    """Добавляет домен в белый список (разрешенные сайты)"""
    global rules
    rules = load_rules()  # Перезагружаем правила
    
    domain = req.domain.lower().strip()
    whitelist = rules.get("whitelist_domains", [])
    
    if domain in whitelist:
        raise HTTPException(status_code=400, detail=f"Домен {domain} уже в белом списке")
    
    whitelist.append(domain)
    rules["whitelist_domains"] = whitelist
    
    if not save_rules(rules):
        raise HTTPException(status_code=500, detail="Ошибка сохранения правил")
    
    return {
        "success": True,
        "message": f"Домен {domain} добавлен в белый список",
        "domains": whitelist
    }

@app.delete("/admin/whitelist/{domain}")
async def remove_from_whitelist(domain: str):
    """Удаляет домен из белого списка"""
    from urllib.parse import unquote
    
    global rules
    rules = load_rules()  # Перезагружаем правила
    
    # Декодируем URL-кодированный домен
    domain_decoded = unquote(domain)
    domain_lower = domain_decoded.lower().strip()
    whitelist = list(rules.get("whitelist_domains", []))  # Создаем копию списка
    
    logging.info(f"Attempting to remove domain from whitelist: {domain_decoded} (lowercase: {domain_lower})")
    logging.info(f"Current whitelist: {whitelist}")
    
    # Ищем точное совпадение (регистронезависимо)
    found_domain = None
    for wl_domain in whitelist:
        if wl_domain.lower().strip() == domain_lower:
            found_domain = wl_domain
            break
    
    if not found_domain:
        # Если точного совпадения нет, пробуем найти частичное совпадение
        for wl_domain in whitelist:
            wl_lower = wl_domain.lower().strip()
            if domain_lower == wl_lower or domain_lower in wl_lower or wl_lower in domain_lower:
                found_domain = wl_domain
                logging.info(f"Found partial match: {wl_domain}")
                break
    
    if not found_domain:
        logging.warning(f"Domain {domain_decoded} not found in whitelist")
        raise HTTPException(status_code=404, detail=f"Домен {domain_decoded} не найден в белом списке")
    
    # Удаляем найденный домен
    whitelist.remove(found_domain)
    rules["whitelist_domains"] = whitelist
    
    logging.info(f"Removed domain from whitelist: {found_domain}, new whitelist: {whitelist}")
    
    if not save_rules(rules):
        logging.error("Failed to save rules after removing domain from whitelist")
        raise HTTPException(status_code=500, detail="Ошибка сохранения правил")
    
    return {
        "success": True,
        "message": f"Домен {found_domain} удален из белого списка",
        "domains": whitelist
    }

@app.get("/admin/auto-scan")
async def get_auto_scan_status():
    """Возвращает статус автосканирования"""
    config = load_auto_scan_config()
    return {
        "enabled": config.get("enabled", True)
    }

@app.post("/admin/auto-scan")
async def set_auto_scan_status(req: AutoScanConfigRequest):
    """Устанавливает статус автосканирования"""
    config = {"enabled": req.enabled}
    if not save_auto_scan_config(config):
        raise HTTPException(status_code=500, detail="Ошибка сохранения настроек автосканирования")
    
    return {
        "success": True,
        "enabled": req.enabled,
        "message": f"Автосканирование {'включено' if req.enabled else 'выключено'}"
    }

TELEGRAM_BOT_TOKEN = "7972590264:AAFvTfbFqyaBS1lLK5W6EWrPEsVh5-KAM58"
TELEGRAM_CHAT_ID = "-1003297580651"

class TelegramReportRequest(BaseModel):
    domain: str
    reason: str | None = None
    incident_id: int | None = None
    timestamp: str | None = None
    url: str | None = None

@app.post("/admin/telegram/report")
async def telegram_report(request: TelegramReportRequest):
    import requests as py_requests
    from datetime import datetime
    domain = request.domain
    reason = request.reason or "Не указана"
    incident_id = request.incident_id or "-"
    ts = request.timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    url = request.url or f"https://{domain}"
    # Технический анализ
    html, status = _fetch_text(url)
    js_urls = _collect_js_urls(url, html)
    is_https = url.lower().startswith("https://")
    html_size = len(html.encode("utf-8", errors="ignore")) if html else 0
    # ИИ-анализ сайта
    ai_report = analyze_urls_with_llm([url])
    ai = ai_report["items"][0] if ai_report and ai_report.get("items") else {}
    def format_ai_report(ai):
        block = []
        block.append(f"▶️ <b>Риск по ИИ:</b> <b>{ai.get('risk')}</b>")
        if ai.get('provider'):
            block.append(f"<b>Провайдер анализа:</b> {ai.get('provider')}")
        reasons = ai.get('reasons') or []
        if reasons:
            block.append("<b>Причины по анализу ИИ:</b>")
            for idx, r in enumerate(reasons, 1):
                block.append(f"    {idx}) {r}")
        return '\n'.join(block)
    ai_block = format_ai_report(ai)
    # ssl
    ssl_info = "Да" if is_https else "Нет"
    # js-подробности
    js_block = f"\n<b>Найдено JS-файлов:</b> {len(js_urls)}" + (f"\n<b>Первые 5 JS:</b> " + '\n - '.join(js_urls[:5]) if js_urls else "")
    msg = (
        f"\u26a0\ufe0f <b>Детальный отчет: Жалоба на опасный сайт</b>\n"
        f"---\n"
        f"<b>Дата и время:</b> {ts}\n"
        f"<b>Исходный URL:</b> <code>{url}</code>\n"
        f"<b>Домен (netloc):</b> <code>{domain}</code>\n"
        f"<b>ID инцидента/запроса:</b> {incident_id}\n"
        f"<b>Причина отправки жалобы:</b> {reason}\n"
        f"<b>Статус HTTPS/SSL:</b> {ssl_info}\n"
        f"<b>Код ответа:</b> {status}\n"
        f"<b>Длина HTML:</b> {html_size} байт\n"
        f"{js_block}\n"
        f"{ai_block}\n"
        f"---\nКонтакт: @your_admin_for_cyber (бот) | PhishGuard\n"
    )
    TELEGRAM_BOT_TOKEN = "7972590264:AAFvTfbFqyaBS1lLK5W6EWrPEsVh5-KAM58"
    TELEGRAM_CHAT_ID = "-1003297580651"
    send_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": msg,
        "parse_mode": "HTML"
    }
    try:
        resp = py_requests.post(send_url, json=payload, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("ok"):
            return {"success": True, "message": "Жалоба успешно отправлена в Telegram"}
        else:
            return {"success": False, "error": data}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)


