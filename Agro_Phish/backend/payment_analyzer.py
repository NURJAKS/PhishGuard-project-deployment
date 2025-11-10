from bs4 import BeautifulSoup
from urllib.parse import urlparse
import hashlib
import json
from typing import Dict, Any, List


def mask_pan(text: str) -> str:
    """Маскирует последовательности цифр длиной 13..19 (похожие на PAN)."""
    import re
    return re.sub(r"\b\d{13,19}\b", "****", text)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def analyze_payment_page(url: str, html_snippet: str, rules: Dict[str, Any]) -> Dict[str, Any]:
    reasons: List[str] = []
    explain: Dict[str, Any] = {}

    safe_url = url or ""
    parsed = urlparse(safe_url)
    domain = parsed.netloc.lower() if parsed.netloc else ""
    scheme = parsed.scheme.lower() if parsed.scheme else ""
    if scheme != "https":
        reasons.append("no_https")

    masked_html = mask_pan(html_snippet or "")
    soup = BeautifulSoup(masked_html, "html.parser")

    forms = soup.find_all("form")
    explain["form_count"] = len(forms)

    contains_card_fields = False
    suspicious_action = False
    exfil_js = False
    action_values = []

    # Токены полей оплаты (EN/RU/KZ)
    tokens_payment = [
        # EN
        "card", "cardnumber", "card_number", "pan", "cvv", "cvc", "expiry", "exp", "mm/yy", "name_on_card", "visa", "mastercard", "paypal",
        # RU
        "номер карты", "номер_карты", "карта", "оплата", "платеж", "cvv", "cvc", "срок", "срок действия", "жарамдылық", "мерзімі",
        # KZ (кириллица)
        "төлем", "карта нөмірі", "cvv", "cvc", "жарамдылық мерзімі"
    ]
    # Токены логина (EN/RU/KZ)
    tokens_login = [
        # EN
        "login", "signin", "username", "user", "password", "pass",
        # RU
        "логин", "пароль", "войти", "учетная запись", "аккаунт",
        # KZ
        "жүйеге кіру", "құпия сөз", "логин"
    ]

    # Легитимные платежные системы и сервисы
    trusted_payment_domains = {
        "stripe.com", "checkout.stripe.com", "js.stripe.com",
        "paypal.com", "www.paypal.com", "checkout.paypal.com",
        "square.com", "squareup.com",
        "braintree.com", "braintreepayments.com",
        "adyen.com", "checkoutshopper-live.adyen.com",
        "razorpay.com", "razorpay.in",
        "2checkout.com", "2co.com",
        "authorize.net",
        "worldpay.com",
        "sagepay.com",
        "klarna.com", "klarna.net",
        "amazon.com", "payments.amazon.com",
        "google.com", "pay.google.com", "payments.google.com",
        "apple.com", "apple-pay.com",
        "canva.com", "www.canva.com", "checkout.canva.com", "pay.canva.com"
    }
    
    def is_same_domain_or_subdomain(action_domain: str, page_domain: str) -> bool:
        """Проверяет, является ли action_domain тем же доменом или поддоменом page_domain"""
        if not action_domain or not page_domain:
            return False
        action_domain = action_domain.lower()
        page_domain = page_domain.lower()
        
        # Точное совпадение
        if action_domain == page_domain:
            return True
        
        # Проверка поддомена (например, checkout.canva.com является поддоменом canva.com)
        # Извлекаем базовый домен (убираем поддомены)
        def get_base_domain(d: str) -> str:
            parts = d.split('.')
            # Для доменов типа .co.uk, .com.au берем последние 2-3 части
            if len(parts) >= 2:
                # Проверяем известные двухчастные TLD
                two_part_tlds = {'co.uk', 'com.au', 'co.nz', 'co.za', 'com.br', 'com.mx'}
                if len(parts) >= 3 and '.'.join(parts[-2:]) in two_part_tlds:
                    return '.'.join(parts[-3:])
                return '.'.join(parts[-2:])
            return d
        
        action_base = get_base_domain(action_domain)
        page_base = get_base_domain(page_domain)
        
        # Если базовые домены совпадают, это поддомен того же домена
        if action_base == page_base:
            return action_domain.endswith('.' + page_base) or page_domain.endswith('.' + action_base)
        
        return False
    
    for f in forms:
        action = (f.get("action") or "").strip()
        action_values.append(action)
        # Проверка action
        if action.startswith("mailto:") or action.startswith("data:"):
            suspicious_action = True
        elif action == "":
            # Пустой action - отправка на тот же URL (безопасно)
            pass
        else:
            try:
                a = urlparse(action)
                # Если action - относительный путь (без scheme и netloc), это безопасно
                if not a.scheme and not a.netloc:
                    # Относительный путь - отправка на тот же домен
                    pass
                elif a.scheme and a.netloc:
                    action_domain = a.netloc.lower()
                    # Проверяем, является ли это поддоменом того же домена
                    if domain and is_same_domain_or_subdomain(action_domain, domain):
                        # Это поддомен того же домена - безопасно
                        pass
                    # Проверяем легитимные платежные системы
                    elif action_domain in trusted_payment_domains:
                        # Легитимная платежная система - безопасно
                        pass
                    # Проверяем, является ли это поддоменом легитимной платежной системы
                    elif any(action_domain.endswith('.' + td) for td in trusted_payment_domains):
                        # Поддомен легитимной платежной системы - безопасно
                        pass
                    else:
                        # Другой домен, не поддомен и не легитимная платежная система
                        suspicious_action = True
            except Exception:
                # Если не удалось распарсить, считаем подозрительным только если явно подозрительные схемы
                if action.startswith("javascript:") or action.startswith("vbscript:"):
                    suspicious_action = True

        # поля формы
        inputs = f.find_all(["input", "select", "textarea"])
        for inp in inputs:
            for attr in ("name", "id", "placeholder", "aria-label", "type"):
                val = (inp.get(attr) or "").lower()
                if any(tok in val for tok in tokens_payment):
                    contains_card_fields = True
                if any(tok in val for tok in tokens_login):
                    explain["contains_login_fields"] = True

    # inline JS на внешние хосты
    for script in soup.find_all("script"):
        if script.string:
            s = script.string.lower()
            if ("fetch(" in s or "xmlhttprequest" in s) and "http" in s and "card" in s:
                exfil_js = True

    if contains_card_fields:
        reasons.append("contains_card_fields")
    if suspicious_action:
        reasons.append("suspicious_form_action")
    if exfil_js:
        reasons.append("exfiltrate_js")

    # Расширенный список известных легитимных доменов
    well_known_domains = {
        "canva.com", "www.canva.com",
        "google.com", "www.google.com", "accounts.google.com",
        "facebook.com", "www.facebook.com",
        "amazon.com", "www.amazon.com",
        "microsoft.com", "www.microsoft.com", "account.microsoft.com",
        "apple.com", "www.apple.com", "id.apple.com",
        "github.com", "www.github.com",
        "netflix.com", "www.netflix.com",
        "spotify.com", "www.spotify.com",
        "youtube.com", "www.youtube.com",
        "twitter.com", "www.twitter.com", "x.com",
        "linkedin.com", "www.linkedin.com",
        "instagram.com", "www.instagram.com",
        "adobe.com", "www.adobe.com",
        "dropbox.com", "www.dropbox.com",
        "salesforce.com", "www.salesforce.com",
        "shopify.com", "www.shopify.com",
        "ebay.com", "www.ebay.com",
        "aliexpress.com", "www.aliexpress.com",
        "booking.com", "www.booking.com",
        "airbnb.com", "www.airbnb.com",
        "uber.com", "www.uber.com",
        "zoom.us", "www.zoom.us",
        "slack.com", "www.slack.com",
        "notion.so", "www.notion.so",
        "figma.com", "www.figma.com",
        "trello.com", "www.trello.com",
        "asana.com", "www.asana.com"
    }
    
    # Правило: логин/оплата на недоверенном домене → warn
    # Но только если домен действительно подозрительный (не известный легитимный домен)
    trusted_domains = set((rules.get("trusted_domains") or []))
    all_trusted = trusted_domains | well_known_domains | trusted_payment_domains
    
    # Проверяем базовый домен (без поддоменов)
    def get_base_domain_for_check(d: str) -> str:
        """Извлекает базовый домен для проверки"""
        if not d:
            return ""
        d = d.lower()
        parts = d.split('.')
        if len(parts) >= 2:
            two_part_tlds = {'co.uk', 'com.au', 'co.nz', 'co.za', 'com.br', 'com.mx', 'co.jp'}
            if len(parts) >= 3 and '.'.join(parts[-2:]) in two_part_tlds:
                return '.'.join(parts[-3:])
            return '.'.join(parts[-2:])
        return d
    
    base_domain = get_base_domain_for_check(domain) if domain else ""
    domain_is_trusted = (
        domain in all_trusted or 
        base_domain in all_trusted or
        any(domain.endswith('.' + td) for td in all_trusted) or
        any(base_domain == td for td in all_trusted)
    )
    
    # Помечаем как подозрительное только если домен действительно не известен
    # и содержит платежные поля или поля логина
    if domain and (contains_card_fields or explain.get("contains_login_fields")) and not domain_is_trusted:
        # Дополнительная проверка: если домен имеет нормальный вид (не подозрительные TLD)
        suspicious_tlds = rules.get("suspicious_tlds", [".tk", ".ml", ".ga", ".cf"])
        has_suspicious_tld = any(domain.endswith(tld) for tld in suspicious_tlds)
        
        # Если домен имеет подозрительный TLD, это более серьезно
        if has_suspicious_tld:
            reasons.append("login_or_payment_on_untrusted")
        # Для нормальных доменов снижаем вес этого правила
        elif len(domain.split('.')) >= 2:  # Минимум домен.топ-уровень
            # Для нормальных доменов это менее критично, но все равно отмечаем
            reasons.append("login_or_payment_on_untrusted")

    # Scoring
    weights = rules.get("weights", {
        "no_https": 0.3,
        "contains_card_fields": 0.4,
        "suspicious_form_action": 0.25,
        "exfiltrate_js": 0.3,
        "blacklist": 0.9
    })
    score = 0.0
    for r in reasons:
        score += float(weights.get(r, 0.0))
    score = min(1.0, score)

    threshold_warn = float(rules.get("threshold_warn", 0.6))
    threshold_block = float(rules.get("threshold_block", 0.85))
    safe = score < threshold_warn

    explain.update({
        "domain": domain,
        "scheme": scheme,
        "action_values": action_values[:5]
    })

    return {
        "safe": safe,
        "score": round(score, 3),
        "reasons": reasons,
        "explain": explain,
        "masked_html_sample": (masked_html[:2000] if masked_html else "")
    }


