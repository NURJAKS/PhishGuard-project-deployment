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

MAX_BYTES = 500_000
DEFAULT_TIMEOUT = 12

# Default API keys
DEFAULT_GOOGLE_API_KEY = "AIzaSyCCfEPfDC3ANvFw6tCGxVSNUZzLg-xhWNo"
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


def _google_ai_analyze(prompt: str) -> Optional[str]:
    """Try Google AI Studio (Gemini)"""
    if not GOOGLE_AVAILABLE:
        logger.warning("[AI API] Google GenAI library not available")
        return None
    
    try:
        api_key = os.getenv("GOOGLE_API_KEY", DEFAULT_GOOGLE_API_KEY)
        api_key_masked = api_key[:10] + "..." + api_key[-5:] if len(api_key) > 15 else "***"
        logger.info(f"[AI API] Using Google AI Studio (Gemini 2.5 Flash)")
        logger.info(f"[AI API] API Key source: {'ENV' if os.getenv('GOOGLE_API_KEY') else 'DEFAULT'} (masked: {api_key_masked})")
        
        client = genai.Client(api_key=api_key)
        
        # Prepare prompt for JSON response in Russian - простым языком
        logger.info(f"[AI API] Sending request to Google AI Studio...")
        full_prompt = f"""Ты - помощник по безопасности в интернете. Проанализируй сайт и объясни простыми словами, безопасен ли он.

ВАЖНО: Пиши ОЧЕНЬ ПРОСТЫМ ЯЗЫКОМ, как будто объясняешь человеку, который не разбирается в компьютерах. Избегай технических терминов типа "HTTPS", "домен", "SSL", "скрипты", "метаданные". Вместо этого используй простые слова: "адрес сайта", "защищенное соединение", "официальный сайт", "подозрительный".

Ответь СТРОГО в формате JSON с ключами:
- url: адрес сайта
- risk: уровень риска ('HIGH'|'LOW'|'MEDIUM')
- reasons: массив из 1-3 коротких предложений на русском языке ПРОСТЫМИ СЛОВАМИ

Пример для безопасного сайта:
{{"url": "https://example.com", "risk": "LOW", "reasons": ["Это официальный сайт известной компании", "Соединение защищено, данные зашифрованы", "Нет ничего подозрительного"]}}

Пример для опасного сайта:
{{"url": "https://fake-bank.com", "risk": "HIGH", "reasons": ["Адрес сайта выглядит подозрительно и не похож на настоящий", "Сайт просит ввести пароль и данные карты", "Соединение не защищено, это может быть мошенничество"]}}

Данные для анализа:
{prompt}"""
        
        response = client.models.generate_content(
            model="gemini-2.5-flash",
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


def _analyze_with_llm(url: str, html_excerpt: str, js_urls: List[str]) -> Dict[str, Any]:
    """Try both LLM providers with fallback"""
    logger.info(f"[SCAN STEP 3] Preparing data for AI analysis: URL={url}, HTML={len(html_excerpt)} chars, JS files={len(js_urls)}")
    
    prompt = json.dumps({
        "url": url,
        "html_excerpt": html_excerpt[:15000],
        "scripts": js_urls[:10],
    }, ensure_ascii=False)
    
    logger.info(f"[SCAN STEP 3] Prompt prepared: {len(prompt)} chars")
    
    # Try Google first
    logger.info(f"[SCAN STEP 3] Attempting Google AI Studio...")
    result = _google_ai_analyze(prompt)
    provider_used = "google"
    
    # Fallback to OpenRouter if Google fails
    if not result:
        logger.warning(f"[SCAN STEP 3] Google AI failed, trying OpenRouter...")
        result = _openrouter_analyze(prompt)
        provider_used = "openrouter"
    
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
        "risk": "LOW",
        "reasons": ["llm_unavailable_or_error"],
        "provider": "none"
    }


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
