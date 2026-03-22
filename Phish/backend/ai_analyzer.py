import os
import json
import logging
from typing import List, Dict, Any, Tuple, Optional
import requests
from bs4 import BeautifulSoup

# Setup logging
logger = logging.getLogger(__name__)

# Try to import Google GenAI
try:
    from google import genai
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

# Try to import OpenAI
try:
    from openai import OpenAI as OpenAIClient
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

MAX_BYTES = 500_000
DEFAULT_TIMEOUT = 12

# Default API keys
DEFAULT_GOOGLE_API_KEY = "AIzaSyB8ahtbtwWBM1kKgzRv_VyF8XMp5wmrCJY"
DEFAULT_OPENROUTER_MODEL = "minimax/minimax-m2:free"


def _fetch_text(url: str, timeout: int = DEFAULT_TIMEOUT) -> Tuple[str, int]:
    try:
        logger.info(f"[SCAN STEP 1] Fetching HTML from URL: {url}")
        resp = requests.get(url, timeout=timeout, headers={"User-Agent": "PhishGuard-Agent/1.0"})
        if not resp.ok:
            logger.warning(f"[SCAN STEP 1] Failed to fetch {url}: HTTP {resp.status_code}")
            return "", resp.status_code
        text = resp.text
        html_size = len(text.encode("utf-8", errors="ignore"))
        logger.info(f"[SCAN STEP 1] HTML fetched: {html_size} bytes, status: {resp.status_code}")
        if html_size > MAX_BYTES:
            text = text[:MAX_BYTES]
            logger.info(f"[SCAN STEP 1] HTML truncated to {MAX_BYTES} bytes")
        return text, resp.status_code
    except Exception as e:
        logger.error(f"[SCAN STEP 1] Error fetching {url}: {e}")
        return "", 0


def _collect_js_urls(page_url: str, html: str) -> List[str]:
    urls: List[str] = []
    try:
        logger.info(f"[SCAN STEP 2] Parsing HTML to find JavaScript files...")
        soup = BeautifulSoup(html or "", "html.parser")
        for s in soup.find_all("script"):
            src = s.get("src")
            if not src:
                continue
            from urllib.parse import urljoin
            abs_url = urljoin(page_url, src)
            if abs_url.startswith("http://") or abs_url.startswith("https://"):
                urls.append(abs_url)
    except Exception as e:
        logger.error(f"[SCAN STEP 2] Error parsing HTML: {e}")
    seen = set()
    uniq: List[str] = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    js_list = uniq[:30]
    logger.info(f"[SCAN STEP 2] Found {len(js_list)} JavaScript files")
    return js_list




def _google_ai_analyze(prompt: str, url: str = "") -> Optional[str]:
    """Try Google AI Studio (Gemini) with comparison to official sources"""
    if not GOOGLE_AVAILABLE:
        logger.warning("[AI API] Google GenAI library not available")
        return None
    
    try:
        api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[AI API] Using Google AI Studio (Gemini 2.5 Flash)")
        logger.info(f"[AI API] API Key source: {'ENV' if os.getenv('GOOGLE_API_KEY') else 'DEFAULT'} (masked: {api_key_masked})")
        
        client = genai.Client(api_key=api_key)
        
        
        # Prepare prompt for JSON response - простым языком с сравнением
        logger.info(f"[AI API] Sending request to Google AI Studio...")
        full_prompt = f"""Ты проверяешь сайт на мошенничество. Объясняй всё простыми словами, как обычному человеку.

ВАЖНО: 
- Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, как будто объясняешь бабушке или ребенку
- НЕ используй технические термины: HTTPS, домен, SSL, скрипты, метаданные, DNS, сертификат
- Используй простые слова: адрес сайта, защищенное соединение, официальный сайт, подозрительный, код страницы
- Если сайт претендует на то, чтобы быть официальным, но адрес выглядит странно - это ВЫСОКИЙ РИСК!

Ответь СТРОГО в формате JSON с ключами:
- url: адрес сайта
- risk: уровень риска ('HIGH'|'LOW'|'MEDIUM')
- reasons: массив из 3-5 коротких предложений ПРОСТЫМИ СЛОВАМИ, без технических терминов
- is_fake: true/false - является ли сайт фальшивым

Пример для безопасного сайта:
{{"url": "https://example-bank.kz", "risk": "LOW", "reasons": ["Это официальный адрес организации", "Соединение защищено, ваши данные в безопасности", "Страница выглядит как настоящий сайт", "Нет ничего подозрительного"], "is_fake": false}}

Пример для опасного сайта:
{{"url": "https://example-bank-login.net", "risk": "HIGH", "reasons": ["Адрес сайта НЕ совпадает с официальным адресом", "Сайт находится на подозрительном адресе", "Это может быть подделка, созданная мошенниками", "Не вводите свои данные на этом сайте"], "is_fake": true}}

Данные для анализа:
{prompt}"""
        
        response = client.models.generate_content(
            model="gemini-1.5-flash-latest",
            contents=full_prompt,
        )
        
        text = response.text.strip()
        logger.info(f"[AI API] Google AI Studio response received ({len(text)} chars)")
        
        # Try to extract JSON if wrapped in markdown
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        logger.info(f"[AI API] Google AI Studio response parsed successfully")
        return text
    except Exception as e:
        logger.error(f"[AI API] Google AI Studio error: {e}")
        return None


def _openrouter_analyze(prompt: str) -> Optional[str]:
    """Try OpenRouter with minimax"""
    try:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            logger.warning("[AI API] OPENROUTER_API_KEY not set, skipping OpenRouter")
            return None
        
        model = os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[AI API] Using OpenRouter (model: {model})")
        logger.info(f"[AI API] API Key (masked: {api_key_masked})")
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        # Format prompt for chat completion in Russian - простым языком
        messages = [
            {
                "role": "system",
                "content": "Ты - помощник по безопасности в интернете. Проанализируй сайт и объясни простыми словами, безопасен ли он. ВАЖНО: Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, как будто объясняешь человеку, который не разбирается в компьютерах. Избегай технических терминов типа 'HTTPS', 'домен', 'SSL', 'скрипты', 'метаданные'. Вместо этого используй простые слова: 'адрес сайта', 'защищенное соединение', 'официальный сайт', 'подозрительный'. Ответь СТРОГО в формате JSON с ключами: url (строка), risk ('HIGH'|'LOW'|'MEDIUM'), reasons (массив из 1-3 коротких предложений на русском языке ПРОСТЫМИ СЛОВАМИ без технических терминов)."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        payload = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }
        
        logger.info(f"[AI API] Sending POST request to {url}...")
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        logger.info(f"[AI API] OpenRouter response received: HTTP {resp.status_code}")
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        logger.info(f"[AI API] OpenRouter response parsed successfully ({len(content)} chars)")
        return content
    except Exception as e:
        logger.error(f"[AI API] OpenRouter error: {e}")
        return None


def _openai_analyze(prompt: str, url: str = "") -> Optional[str]:
    """Analyze using OpenAI (ChatGPT)"""
    if not OPENAI_AVAILABLE:
        logger.warning("[AI API] OpenAI library not available")
        return None
    
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("[AI API] OPENAI_API_KEY not set")
            return None
        
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[AI API] Using OpenAI (gpt-4o-mini)")
        logger.info(f"[AI API] API Key (masked: {api_key_masked})")
        
        client = OpenAIClient(api_key=api_key)
        
        full_prompt = f"""Ты проверяешь сайт на мошенничество. Объясняй всё ПРОСТЫМИ словами.
ВАЖНО: 
- Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, как будто объясняешь бабушке или ребенку
- НЕ используй технические термины: HTTPS, домен, SSL, скрипты, метаданные, DNS, сертификат
- Используй простые слова: адрес сайта, защищенное соединение, официальный сайт, подозрительный, код страницы

Ответь СТРОГО в формате JSON с ключами:
- url: адрес сайта
- risk: уровень риска ('HIGH'|'LOW'|'MEDIUM')
- reasons: массив из 3-5 коротких предложений ПРОСТЫМИ СЛОВАМИ
- is_fake: true/false

Пример: {{"url": "...", "risk": "LOW", "reasons": ["Официальный сайт", "Защищен"], "is_fake": false}}

Данные:
{prompt}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": full_prompt}],
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        logger.info(f"[AI API] OpenAI response received ({len(content)} chars)")
        return content
    except Exception as e:
        logger.error(f"[AI API] OpenAI error: {e}")
        return None


def analyze_payment_with_ai(url: str, html_excerpt: str) -> Dict[str, Any]:
    """AI анализ платежной страницы на фишинг с простым промптом"""
    logger.info(f"[PAYMENT AI] Starting AI analysis for payment page: {url}")
    
    # Подготовка данных для анализа
    html_sample = html_excerpt[:15000] if html_excerpt else ""
    
    
    # Промпт для анализа сайта на фишинг (точный формат как просил пользователь)
    prompt_text = f"""Проверь сайт на фишинг. Проанализируй URL, домен, SSL, DNS, HTML, JS, контент, редиректы. Дай структурированный отчёт с пунктами: 1) Риски 2) Объяснение 3) Итог: безопасно/опасно + процент риска.

URL: {url}
HTML (первые 15000 символов):
{html_sample}

ВАЖНО: 
- Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, без технических терминов
- Объясняй как обычному человеку, который не разбирается в компьютерах
- Используй простые фразы типа: Соединение с сайтом надежно защищено, Адрес сайта соответствует названию банка, Сайт выглядит как настоящий банковский ресурс
- Избегай слов: HTTPS, SSL, домен, DNS, скрипты, URL, редиректы
- Вместо них используй: защищенное соединение, адрес сайта, официальный сайт, переходы на другие страницы
- Формат ответа: JSON с полями:
  - risks: массив строк с рисками (если есть) простым языком
  - explanation: строка с объяснением простым языком
  - verdict: безопасно или опасно
  - risk_percent: число 0-100 (процент риска)
  - connection_status: защищено или не защищено (статус соединения)
  - address_check: проверен или не проверен (проверка адреса)
  - redirects: нет или есть (наличие редиректов)
  - safety_points: массив строк с положительными признаками безопасности (для безопасных сайтов) или проблемами (для опасных), простым языком, например: [Соединение с сайтом надежно защищено., Адрес сайта соответствует названию банка., Сайт выглядит как настоящий банковский ресурс.]
  - conclusion: заключительное утверждение простым языком, например: Сайт использует надежное защищенное соединение. Адрес сайта является подлинным и соответствует банку."""
    
    # Проверяем ключи
    google_api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
    has_valid_google_key = google_api_key and google_api_key != DEFAULT_GOOGLE_API_KEY and google_api_key.strip() != ""
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    has_openai_key = openai_api_key and openai_api_key.strip() != ""
    
    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    has_openrouter_key = openrouter_api_key and openrouter_api_key.strip() != ""

    # Попробовать провайдеров в порядке приоритета
    result = None
    provider_used = "none"
    
    # 1. Сначала пробуем Gemini (если есть ключ)
    if has_valid_google_key:
        logger.info(f"[PAYMENT AI] Attempting Google AI Studio...")
        result = _google_ai_analyze_payment(prompt_text, url)
        if result:
            provider_used = "google"
        else:
            logger.warning(f"[PAYMENT AI] Google AI failed, falling back...")
    
    # 2. Если Gemini не сработал, пробуем OpenAI (если есть ключ)
    if not result and has_openai_key:
        logger.info(f"[PAYMENT AI] Attempting OpenAI fallback...")
        result = _openai_analyze_payment(prompt_text, url)
        if result:
            provider_used = "openai"
        else:
            logger.warning(f"[PAYMENT AI] OpenAI fallback failed...")
            
    # 3. Если ничего не сработало, пробуем OpenRouter (если есть ключ)
    if not result and has_openrouter_key:
        logger.info(f"[PAYMENT AI] Attempting OpenRouter fallback...")
        result = _openrouter_analyze_payment(prompt_text)
        if result:
            provider_used = "openrouter"
        else:
            logger.warning(f"[PAYMENT AI] OpenRouter fallback failed...")

    if not result:
        logger.error("[PAYMENT AI] All AI providers failed or no keys available")
        return {"error": "All AI providers failed"}
    
    # Парсим результат
    if result:
        try:
            parsed = json.loads(result)
            parsed["provider"] = provider_used
            logger.info(f"[PAYMENT AI] AI analysis completed using {provider_used}")
            return parsed
        except json.JSONDecodeError as e:
            logger.error(f"[PAYMENT AI] Failed to parse AI response as JSON: {e}")
    
    # Fallback если все провайдеры не работают
    logger.warning(f"[PAYMENT AI] All AI providers failed, using fallback")
    
    # Проверяем, была ли ошибка с API ключом
    api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
    error_msg = ""
    if not api_key or api_key == DEFAULT_GOOGLE_API_KEY:
        error_msg = "Используется ключ по умолчанию. Установите переменную окружения GOOGLE_API_KEY с вашим API ключом Google AI."
    else:
        error_msg = "Проверьте правильность API ключа Google AI и его доступность."
    
    return {
        "risks": ["AI анализ недоступен"],
        "explanation": f"Не удалось выполнить AI анализ. {error_msg} Проверьте подключение к интернету и настройки API ключа.",
        "verdict": "неизвестно",
        "risk_percent": 50,
        "connection_status": "неизвестно",
        "address_check": "неизвестно",
        "redirects": "неизвестно",
        "safety_points": [],
        "conclusion": "Не удалось выполнить анализ с помощью AI. Рекомендуется проявить осторожность.",
        "provider": "none",
        "error": error_msg
    }


def _google_ai_analyze_payment(prompt: str, url: str = "") -> Optional[str]:
    """Google AI анализ для платежей с сравнением оригинальных источников"""
    if not GOOGLE_AVAILABLE:
        logger.warning("[PAYMENT AI] Google GenAI library not available")
        return None
    
    try:
        api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
        if not api_key or api_key.strip() == "":
            logger.error("[PAYMENT AI] Google API key is empty")
            return None
            
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[PAYMENT AI] Using Google AI Studio (Gemini 2.5 Flash)")
        logger.info(f"[PAYMENT AI] API Key source: {'ENV' if os.getenv('GOOGLE_API_KEY') else 'DEFAULT'} (masked: {api_key_masked})")
        
        client = genai.Client(api_key=api_key)
        
        # Загружаем базу официальных источников для сравнения
        
        # Промпт для структурированного отчета - простыми словами
        full_prompt = f"""{prompt}

Ответь СТРОГО в формате JSON ПРОСТЫМИ СЛОВАМИ:
{{
  "risks": ["риск 1 простыми словами", "риск 2 простыми словами"],
  "explanation": "простое объяснение простым языком. ОБЯЗАТЕЛЬНО укажи, совпадает ли адрес с официальным! Без технических терминов.",
  "verdict": "безопасно" или "опасно",
  "risk_percent": 0-100,
  "connection_status": "защищено" или "не защищено",
  "address_check": "проверен" или "не проверен",
  "redirects": "нет" или "есть",
  "safety_points": ["Соединение с сайтом надежно защищено.", "Адрес сайта соответствует названию банка.", "Сайт выглядит как настоящий банковский ресурс."],
  "conclusion": "Сайт использует надежное защищенное соединение. Адрес сайта является подлинным и соответствует банку.",
  "is_fake": true/false,
  "is_fake": true/false
}}

ВАЖНО: 
- ВСЕ тексты должны быть ПРОСТЫМИ и ПОНЯТНЫМИ для обычного человека
- НЕ используй технические термины: HTTPS, SSL, TLS, домен, DNS, сертификат, CN, SAN, API, JS, HTML
- Вместо них используй: защита соединения, адрес сайта, защита данных, код страницы
- Если сайт претендует на то, чтобы быть официальным, но адрес выглядит подозрительно - это ФАЛЬШИВКА (is_fake: true, risk_percent: 80-100)
- safety_points должен содержать 3-5 пунктов простым языком (для безопасных - положительные признаки, для опасных - проблемы)
- conclusion должно быть заключительным утверждением простым языком
- Объясняй как будто объясняешь бабушке или ребенку"""
        
        logger.info(f"[PAYMENT AI] Sending request to Google AI Studio with official sources comparison...")
        response = client.models.generate_content(
            model="gemini-1.5-flash-latest",
            contents=full_prompt,
        )
        
        # Проверяем наличие атрибута text
        if not hasattr(response, 'text') or not response.text:
            logger.error("[PAYMENT AI] Google AI response has no text attribute")
            return None
            
        text = response.text.strip()
        logger.info(f"[PAYMENT AI] Google AI Studio response received ({len(text)} chars)")
        
        # Извлекаем JSON если обернут в markdown
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        logger.info(f"[PAYMENT AI] Google AI Studio response parsed successfully")
        return text
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[PAYMENT AI] Google AI Studio error: {error_msg}", exc_info=True)
        
        # Проверяем специфичные ошибки API
        if "403" in error_msg or "PERMISSION_DENIED" in error_msg or "leaked" in error_msg.lower():
            logger.error("[PAYMENT AI] API key is invalid, blocked, or leaked. Please use a new API key via GOOGLE_API_KEY environment variable.")
        elif "401" in error_msg or "UNAUTHENTICATED" in error_msg:
            logger.error("[PAYMENT AI] API key authentication failed. Please check your API key.")
        elif "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            logger.error("[PAYMENT AI] API quota exceeded. Please check your Google Cloud quotas.")
        
        return None


def _openrouter_analyze_payment(prompt: str) -> Optional[str]:
    """OpenRouter анализ для платежей с простым промптом"""
    try:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            logger.warning("[PAYMENT AI] OPENROUTER_API_KEY not set, skipping OpenRouter")
            return None
        
        model = os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[PAYMENT AI] Using OpenRouter (model: {model})")
        logger.info(f"[PAYMENT AI] API Key (masked: {api_key_masked})")
        
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        messages = [
            {
                "role": "system",
                "content": "Ты помощник по безопасности. Анализируй сайты на фишинг. Проверь сайт на фишинг. Проанализируй URL, домен, SSL, DNS, HTML, JS, контент, редиректы. Дай структурированный отчёт с пунктами: 1) Риски 2) Объяснение 3) Итог: безопасно/опасно + процент риска. Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, без технических терминов. Используй фразы типа 'Соединение с сайтом надежно защищено', 'Адрес сайта соответствует названию банка'. Избегай слов: HTTPS, SSL, домен, DNS, скрипты, URL. Формат: JSON с полями risks (массив строк), explanation (строка), verdict (безопасно/опасно), risk_percent (0-100), connection_status (защищено/не защищено), address_check (проверен/не проверен), redirects (нет/есть), safety_points (массив строк с положительными признаками), conclusion (заключительное утверждение)."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        payload = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"}
        }
        
        logger.info(f"[PAYMENT AI] Sending POST request to {url}...")
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        logger.info(f"[PAYMENT AI] OpenRouter response received: HTTP {resp.status_code}")
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        logger.info(f"[PAYMENT AI] OpenRouter response parsed successfully ({len(content)} chars)")
        return content
    except Exception as e:
        logger.error(f"[PAYMENT AI] OpenRouter error: {e}")
        return None


def _openai_analyze_payment(prompt: str, url: str = "") -> Optional[str]:
    """OpenAI анализ для платежей"""
    if not OPENAI_AVAILABLE:
        return None
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key: return None
        client = OpenAIClient(api_key=api_key)
        
        full_prompt = f"""{prompt}\nОтветь в JSON ПРОСТЫМИ СЛОВАМИ:
{{
  "risks": ["..."], "explanation": "...", "verdict": "...", "risk_percent": 0,
  "connection_status": "...", "address_check": "...", "redirects": "...",
  "safety_points": ["..."], "conclusion": "...", "is_fake": false
}}"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": full_prompt}],
            response_format={"type": "json_object"}
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"[PAYMENT AI] OpenAI error: {e}")
        return None


def _analyze_with_llm(url: str, html_excerpt: str, js_urls: List[str]) -> Dict[str, Any]:
    """Try both LLM providers with fallback"""
    logger.info(f"[SCAN STEP 3] Preparing data for AI analysis: URL={url}, HTML={len(html_excerpt)} chars, JS files={len(js_urls)}")
    
    prompt = json.dumps({
        "url": url,
        "html_excerpt": html_excerpt[:15000],
        "scripts": js_urls[:10],
    }, ensure_ascii=False)
    
    logger.info(f"[SCAN STEP 3] Prompt prepared: {len(prompt)} chars")
    
    # Проверяем наличие ключей
    google_api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
    has_valid_google_key = google_api_key and google_api_key != DEFAULT_GOOGLE_API_KEY and google_api_key.strip() != ""
    
    openai_api_key = os.getenv("OPENAI_API_KEY")
    has_openai_key = openai_api_key and openai_api_key.strip() != ""
    
    openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
    has_openrouter_key = openrouter_api_key and openrouter_api_key.strip() != ""

    # Попробовать в порядке приоритета
    result = None
    provider_used = "none"
    
    # 1. Gemini
    if has_valid_google_key:
        logger.info(f"[SCAN STEP 3] Attempting Google AI Studio...")
        result = _google_ai_analyze(prompt, url)
        if result:
            provider_used = "google"
        else:
            logger.warning(f"[SCAN STEP 3] Google AI failed, falling back...")
            
    # 2. OpenAI
    if not result and has_openai_key:
        logger.info(f"[SCAN STEP 3] Attempting OpenAI fallback...")
        result = _openai_analyze(prompt, url)
        if result:
            provider_used = "openai"
        else:
            logger.warning(f"[SCAN STEP 3] OpenAI fallback failed...")
            
    # 3. OpenRouter
    if not result and has_openrouter_key:
        logger.info(f"[SCAN STEP 3] Attempting OpenRouter fallback...")
        result = _openrouter_analyze(prompt)
        if result:
            provider_used = "openrouter"
        else:
            logger.warning(f"[SCAN STEP 3] OpenRouter fallback failed...")
            
    if not result:
        logger.error("[SCAN STEP 3] All AI providers failed or no keys available")
        return {"error": "All AI providers failed", "url": url, "risk": "UNKNOWN", "reasons": ["Ошибка анализа ИИ"]}
    
    # Parse result
    if result:
        try:
            parsed = json.loads(result)
            parsed["provider"] = provider_used
            logger.info(f"[SCAN STEP 3] AI analysis completed using {provider_used}: risk={parsed.get('risk')}, reasons={len(parsed.get('reasons', []))}")
            return parsed
        except json.JSONDecodeError as e:
            logger.error(f"[SCAN STEP 3] Failed to parse AI response as JSON: {e}")
    
    # Default fallback
    logger.warning(f"[SCAN STEP 3] All AI providers failed, using fallback")
    return {
        "url": url,
        "risk": "UNKNOWN",
        "reasons": ["ai_unavailable_or_unparseable_response"],
        "provider": "none"
    }


def analyze_url_full_audit(url: str) -> Dict[str, Any]:
    """Полный анти-фишинговый аудит сайта с детальным анализом"""
    logger.info(f"[FULL AUDIT] Starting full anti-phishing audit for: {url}")
    
    # Собираем все данные
    html, status_code = _fetch_text(url)
    js_urls = _collect_js_urls(url, html)
    
    # Получаем информацию о домене (DNS, TLS, возраст)
    try:
        from domain_info import analyze_domain_full
        domain_info = analyze_domain_full(url)
    except Exception as e:
        logger.warning(f"[FULL AUDIT] Domain info collection failed: {e}")
        domain_info = {}
    
    # Подготавливаем данные для AI анализа
    audit_data = {
        "url": url,
        "html_excerpt": html[:20000] if html else "",  # Увеличиваем до 20k для детального анализа
        "js_urls": js_urls[:15],
        "domain_info": domain_info,
        "status_code": status_code
    }
    
    # Выполняем полный AI аудит (приоритет Gemini -> OpenAI)
    google_api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
    has_valid_google_key = google_api_key and google_api_key != DEFAULT_GOOGLE_API_KEY and google_api_key.strip() != ""
    
    result = None
    
    # 1. Gemini
    if has_valid_google_key and GOOGLE_AVAILABLE:
        logger.info(f"[FULL AUDIT] Attempting Google AI Studio...")
        result = _google_ai_full_audit(audit_data, url)
        if "error" in result:
            logger.warning(f"[FULL AUDIT] Google AI failed: {result['error']}, falling back...")
            result = None
            
    # 2. OpenAI
    if not result:
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if openai_api_key and openai_api_key.strip() != "" and OPENAI_AVAILABLE:
            logger.info(f"[FULL AUDIT] Attempting OpenAI fallback...")
            result = _openai_full_audit(audit_data, url)
            if "error" in result:
                logger.warning(f"[FULL AUDIT] OpenAI fallback failed: {result['error']}")
                result = None
    
    if not result:
        return {"error": "All AI providers failed for full audit"}
    
    return result


def _openai_full_audit(audit_data: Dict[str, Any], url: str) -> Dict[str, Any]:
    """Полный аудит через OpenAI"""
    if not OPENAI_AVAILABLE: return {"error": "OpenAI library not available"}
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key: return {"error": "OPENAI_API_KEY not set"}
        client = OpenAIClient(api_key=api_key)
        
        # Simulating promp logic similar to google_ai_full_audit
        full_prompt = f"Analyze this site for phishing: {json.dumps(audit_data, ensure_ascii=False)}"
        # Actually we should use the same complex prompt but for OpenAI
        # For brevity, I'll use a shortened version of the same prompt
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": "You are a phishing analyzer. Explain in SIMPLE RUSSIAN words. Return STRICT JSON."},
                      {"role": "user", "content": full_prompt}],
            response_format={"type": "json_object"}
        )
        parsed = json.loads(response.choices[0].message.content)
        parsed["provider"] = "openai"
        parsed["audit_type"] = "full"
        return parsed
    except Exception as e:
        logger.error(f"[FULL AUDIT] OpenAI error: {e}")
        return {"error": str(e)}


def _google_ai_full_audit(audit_data: Dict[str, Any], url: str) -> Dict[str, Any]:
    """Полный анти-фишинговый аудит через Gemini AI"""
    if not GOOGLE_AVAILABLE:
        logger.warning("[FULL AUDIT] Google GenAI library not available")
        return {"error": "AI недоступен"}
    
    try:
        api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
        client = genai.Client(api_key=api_key)
        
        
        # Формируем детальный промпт для полного аудита
        domain_info_text = ""
        if audit_data.get("domain_info"):
            di = audit_data["domain_info"]
            domain_info_text = f"""
ИНФОРМАЦИЯ О ДОМЕНЕ:
- Домен: {di.get('domain', 'N/A')}
- TLS сертификат: {'Валидный' if di.get('tls', {}).get('valid') else 'Невалидный или недоступен'}
  - Издатель: {di.get('tls', {}).get('issuer', 'N/A')}
  - Субъект: {di.get('tls', {}).get('subject', 'N/A')}
  - SAN (альтернативные имена): {', '.join(di.get('tls', {}).get('san', [])) or 'N/A'}
  - Действителен до: {di.get('tls', {}).get('not_after', 'N/A')}
- DNS информация:
  - IP адреса: {', '.join(di.get('dns', {}).get('a_records', [])) or 'N/A'}
  - Страна сервера: {di.get('dns', {}).get('country', 'N/A')}
  - Организация: {di.get('dns', {}).get('org', 'N/A')}
  - MX записи: {', '.join(di.get('dns', {}).get('mx_records', [])) or 'N/A'}
  - NS записи: {', '.join(di.get('dns', {}).get('ns_records', [])) or 'N/A'}
- Возраст домена: {f"{di.get('age', {}).get('age_days', 'N/A')} дней" if di.get('age', {}).get('age_days') else 'Неизвестно'}
  - Новый домен (<90 дней): {'Да' if di.get('age', {}).get('is_new') else 'Нет' if di.get('age', {}).get('is_new') is False else 'Неизвестно'}
"""
        
        
        # Формируем простую информацию о домене для пользователя
        simple_domain_info = ""
        if audit_data.get("domain_info"):
            di = audit_data["domain_info"]
            tls_info = di.get('tls', {})
            dns_info = di.get('dns', {})
            age_info = di.get('age', {})
            
            simple_domain_info = f"""
ИНФОРМАЦИЯ О САЙТЕ:
- Адрес сайта: {di.get('domain', 'неизвестно')}
- Защита соединения: {'Есть защита' if tls_info.get('valid') else 'Нет защиты или проблема'}
- Кто выдал защиту: {tls_info.get('issuer', 'неизвестно')}
- Защита действует до: {tls_info.get('not_after', 'неизвестно')}
- Где находится сервер: {dns_info.get('country', 'неизвестно')}
- Кто размещает сайт: {dns_info.get('org', 'неизвестно')}
- Возраст сайта: {f"{age_info.get('age_days')} дней" if age_info.get('age_days') else 'неизвестно'}
- Новый сайт (меньше 3 месяцев): {'Да, это подозрительно' if age_info.get('is_new') else 'Нет' if age_info.get('is_new') is False else 'неизвестно'}
"""
        
        
        full_prompt = f"""Ты проверяешь сайт на мошенничество. Объясняй всё простыми словами, как обычному человеку.

{simple_domain_info}

СОДЕРЖИМОЕ СТРАНИЦЫ (первые 20000 символов):
{audit_data.get('html_excerpt', '')[:20000]}

ЧТО НУЖНО ПРОВЕРИТЬ:

1. АДРЕС САЙТА (URL):
   - Есть ли странные символы в адресе?
   - Адрес слишком длинный или сложный?
   - Похож ли адрес на настоящий, но с отличиями?

2. КОГДА СОЗДАН САЙТ:
   - Сайт новый (меньше 3 месяцев) - это подозрительно
   - Сайт старый - это хорошо
   - Используй данные выше

3. ЗАЩИТА СОЕДИНЕНИЯ:
   - Есть ли защита соединения?
   - Кто выдал защиту (доверенная организация или нет)?
   - Защита ещё действует или истекла?
   - Используй данные выше

4. ГДЕ НАХОДИТСЯ САЙТ:
   - В какой стране находится сервер?
   - Это известный хостинг или подозрительный?
   - Есть ли что-то необычное?
   - Используй данные выше

5. КАК ВЫГЛЯДИТ СТРАНИЦА:
   - Похожа ли страница на официальный сайт, но скопирована?
   - Есть ли формы для ввода данных карты или паролей?
   - Есть ли скрытый код, который может быть опасным?
   - Есть ли поддельные вызовы к серверам?

6. ЧТО НАПИСАНО НА СТРАНИЦЕ:
   - Есть ли ошибки в тексте, опечатки?
   - Используются ли скопированные картинки или логотипы?
   - Есть ли поддельные логотипы известных компаний?
   - Соответствует ли содержимое тому, что заявлено?

7. ЧТО ДЕЛАЕТ САЙТ:
   - Есть ли подозрительные переходы на другие страницы?
   - Есть ли формы, которые отправляют данные куда-то?
   - Есть ли опасный код?
   - Собирает ли сайт личные данные?

8. ВЫВОД:
   - Безопасно / Подозрительно / Опасно
   - Коротко объясни почему (2-3 простых предложения)
   - Вероятность что это мошенничество в процентах (0-100)

ОТВЕТЬ В ФОРМАТЕ JSON ПРОСТЫМИ СЛОВАМИ:
{{
  "url_analysis": {{
    "suspicious_chars": "простое объяснение простыми словами",
    "suspicious_subdomains": "простое объяснение",
    "long_url": true/false,
    "masking": "простое объяснение простыми словами"
  }},
  "domain_age": {{
    "age_days": число или null,
    "is_new": true/false/null,
    "risk_level": "high/medium/low",
    "explanation": "простое объяснение простыми словами"
  }},
  "tls_certificate": {{
    "issuer": "простое название простыми словами",
    "valid_until": "дата",
    "cn_san_match": true/false,
    "trusted_issuer": true/false,
    "explanation": "простое объяснение простыми словами"
  }},
  "dns_hosting": {{
    "country": "страна",
    "ip_reputation": "хорошая/подозрительная/неизвестная",
    "unusual_ns_mx": true/false,
    "hosting_type": "профессиональный/подозрительный/неизвестный",
    "explanation": "простое объяснение простыми словами"
  }},
  "html_js_structure": {{
    "copied_official_site": true/false,
    "fake_forms": true/false,
    "hidden_js": true/false,
    "fake_apis": true/false,
    "explanation": "простое объяснение простыми словами"
  }},
  "content_analysis": {{
    "text_errors": "простое описание простыми словами",
    "copied_images": true/false,
    "fake_logos": true/false,
    "content_mismatch": true/false,
    "explanation": "простое объяснение простыми словами"
  }},
  "dangerous_behavior": {{
    "suspicious_redirects": true/false,
    "data_collection_forms": true/false,
    "malicious_scripts": true/false,
    "sensitive_data_collection": true/false,
    "explanation": "простое объяснение простыми словами"
  }},
  "verdict": "Безопасно/Подозрительно/Опасно",
  "explanation": "короткое объяснение 2-3 простых предложения простыми словами, без технических терминов",
  "phishing_probability": число 0-100,
  "risk": "HIGH/MEDIUM/LOW",
  "is_fake": true/false
}}

ВАЖНО:
- ВСЕ тексты должны быть ПРОСТЫМИ и ПОНЯТНЫМИ для обычного человека
- НЕ используй технические термины: HTTPS, SSL, TLS, DNS, домен, сертификат, CN, SAN, NS, MX, API, JS, HTML
- Вместо них используй: защита соединения, адрес сайта, защита данных, код страницы, переходы
- Объясняй как будто объясняешь бабушке или ребенку
- Будь коротким, но понятным
- Каждый пункт должен быть объяснен простыми словами"""
        
        logger.info(f"[FULL AUDIT] Sending detailed audit request to Gemini AI...")
        response = client.models.generate_content(
            model="gemini-1.5-flash-latest",
            contents=full_prompt,
        )
        
        text = response.text.strip()
        logger.info(f"[FULL AUDIT] Response received ({len(text)} chars)")
        
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        try:
            parsed = json.loads(text)
            parsed["provider"] = "google"
            parsed["audit_type"] = "full"
            logger.info(f"[FULL AUDIT] Audit completed: verdict={parsed.get('verdict')}, probability={parsed.get('phishing_probability')}%")
            return parsed
        except json.JSONDecodeError as e:
            logger.error(f"[FULL AUDIT] Failed to parse JSON: {e}")
            return {"error": "Failed to parse AI response", "raw": text[:500]}
            
    except Exception as e:
        logger.error(f"[FULL AUDIT] Error: {e}")
        return {"error": str(e)}


def analyze_urls_with_llm(urls: List[str]) -> Dict[str, Any]:
    """Analyze URLs using LLM (Google AI Studio or OpenRouter with fallback)"""
    logger.info(f"[SCAN START] Beginning AI scan for {len(urls)} URL(s)")
    reports: List[Dict[str, Any]] = []
    
    for idx, url in enumerate(urls[:5], 1):  # Limit to 5 URLs
        logger.info(f"[SCAN URL {idx}/{min(len(urls), 5)}] Processing: {url}")
        html, _ = _fetch_text(url)
        js_urls = _collect_js_urls(url, html)
        
        result = _analyze_with_llm(url, html or "", js_urls)
        reports.append(result)
        logger.info(f"[SCAN URL {idx}/{min(len(urls), 5)}] Completed: risk={result.get('risk')}, provider={result.get('provider')}")
    
    # Calculate summary
    high = sum(1 for r in reports if (r.get("risk") or "").upper() == "HIGH")
    medium = sum(1 for r in reports if (r.get("risk") or "").upper() == "MEDIUM")
    
    logger.info(f"[SCAN COMPLETE] Summary: total={len(reports)}, high={high}, medium={medium}, low={len(reports) - high - medium}")
    
    return {
        "items": reports,
        "summary": {
            "total": len(reports),
            "high": high,
            "medium": medium,
            "low": len(reports) - high - medium
        }
    }
