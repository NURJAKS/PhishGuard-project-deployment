import re
from typing import List, Dict, Any, Tuple
import requests
from bs4 import BeautifulSoup


DEFAULT_TIMEOUT_SECS = 8
MAX_JS_BYTES = 750_000  # avoid downloading huge bundles


def _fetch_text(url: str, timeout: int = DEFAULT_TIMEOUT_SECS) -> Tuple[str, int]:
    try:
        resp = requests.get(url, timeout=timeout, headers={"User-Agent": "PhishGuard-Scanner/1.0"})
        if not resp.ok:
            return "", resp.status_code
        text = resp.text
        if len(text.encode("utf-8", errors="ignore")) > MAX_JS_BYTES:
            text = text[:MAX_JS_BYTES]
        return text, resp.status_code
    except Exception:
        return "", 0


def _absolutize_url(base_url: str, candidate: str) -> str:
    try:
        from urllib.parse import urljoin
        return urljoin(base_url, candidate)
    except Exception:
        return candidate


def _collect_js_urls(page_url: str, html: str) -> List[str]:
    urls: List[str] = []
    try:
        soup = BeautifulSoup(html or "", "html.parser")
        for s in soup.find_all("script"):
            src = s.get("src")
            if not src:
                # inline script cannot be fetched as URL, skip here
                continue
            abs_url = _absolutize_url(page_url, src)
            if abs_url.startswith("http://") or abs_url.startswith("https://"):
                urls.append(abs_url)
    except Exception:
        pass
    # de-duplicate while preserving order
    seen = set()
    uniq: List[str] = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        uniq.append(u)
    return uniq[:50]  # hard cap


# A compact set of useful secret regexes inspired by Pinkerton/Gitleaks patterns
SECRET_PATTERNS: Dict[str, str] = {
    "aws_access_key_id": r"AKIA[0-9A-Z]{16}",
    "aws_secret_access_key": r"(?i)aws(.{0,20})?(secret|access)[\s:=\"']{0,5}([A-Za-z0-9/+=]{40})",
    "google_api_key": r"AIza[0-9A-Za-z\-_]{35}",
    "github_token": r"gh[pousr]_[A-Za-z0-9_]{36,255}",
    "slack_token": r"xox[aboprs]-[0-9A-Za-z\-]{10,48}",
    "twilio_api_key": r"SK[0-9a-fA-F]{32}",
    "mailgun_api_key": r"key-[0-9a-zA-Z]{32}",
    "heroku_api_key": r"(?i)heroku(.{0,20})?api(.{0,5})?key[\s:=\"']{0,5}[0-9a-fA-F]{32}",
    "private_key": r"-----BEGIN (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|DSA|EC|OPENSSH) PRIVATE KEY-----",
    "password_in_code": r"(?i)(password|pwd|passwd)[\s:=\"']{0,5}[A-Za-z0-9!@#$%^&*()_+\-={}\[\]:;\"'`,.<>/?]{6,}",
}


def _scan_text_for_secrets(text: str) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    if not text:
        return findings
    for name, pattern in SECRET_PATTERNS.items():
        try:
            for m in re.finditer(pattern, text):
                snippet = text[max(0, m.start() - 20): m.end() + 20]
                findings.append({
                    "type": name,
                    "match": m.group(0),
                    "context": snippet
                })
        except re.error:
            # invalid pattern shouldn't break the whole scan
            continue
    return findings


def scan_url_for_js_secrets(url: str) -> Dict[str, Any]:
    """
    Crawl a single page, fetch linked JS, and scan for common secrets.
    Returns a summary compatible with extension consumption.
    """
    page_html, status = _fetch_text(url)
    js_urls = _collect_js_urls(url, page_html)
    results: List[Dict[str, Any]] = []

    for js_url in js_urls:
        js_text, js_status = _fetch_text(js_url)
        if not js_text:
            continue
        findings = _scan_text_for_secrets(js_text)
        if findings:
            results.append({
                "script_url": js_url,
                "http_status": js_status,
                "findings": findings,
                "num_findings": len(findings),
            })

    total_findings = sum(r.get("num_findings", 0) for r in results)
    # Risk score: simple heuristic — clamp to [0, 1]
    score = 0.0
    if total_findings > 0:
        score = min(1.0, 0.25 + 0.15 * min(10, total_findings))

    # Также считаем inline скрипты для более точной статистики
    try:
        soup = BeautifulSoup(page_html or "", "html.parser")
        inline_scripts = len(soup.find_all("script", src=False))
        total_elements = len(js_urls) + inline_scripts
    except:
        total_elements = len(js_urls)
    
    return {
        "url": url,
        "scanned_scripts": len(js_urls),
        "scanned_elements": total_elements,  # Всего элементов (внешние + inline)
        "total_findings": total_findings,
        "score": score,
        "results": results,
    }


