"""
Модуль для сбора информации о домене: DNS, TLS, возраст домена
"""
import socket
import ssl
import requests
import logging
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse
from datetime import datetime

logger = logging.getLogger(__name__)

# Проверка доступности dnspython
try:
    import dns.resolver
    import dns.exception
    DNS_AVAILABLE = True
except ImportError:
    DNS_AVAILABLE = False
    logger.warning("dnspython not available, DNS checks will be limited")


def get_tls_info(domain: str) -> Dict[str, Any]:
    """Получает информацию о TLS сертификате"""
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                
                issuer = dict(x[0] for x in cert.get('issuer', []))
                subject = dict(x[0] for x in cert.get('subject', []))
                
                # Извлекаем SAN (Subject Alternative Names)
                san_list = []
                for ext in cert.get('subjectAltName', []):
                    san_list.append(ext[1])
                
                # Проверяем срок действия
                not_before = cert.get('notBefore', '')
                not_after = cert.get('notAfter', '')
                
                return {
                    "issuer": issuer.get('organizationName', 'Unknown'),
                    "subject": subject.get('commonName', 'Unknown'),
                    "san": san_list,
                    "not_before": not_before,
                    "not_after": not_after,
                    "valid": True
                }
    except Exception as e:
        logger.warning(f"TLS info error for {domain}: {e}")
        return {"valid": False, "error": str(e)}


def get_dns_info(domain: str) -> Dict[str, Any]:
    """Получает DNS информацию о домене"""
    result = {
        "a_records": [],
        "mx_records": [],
        "ns_records": [],
        "country": None,
        "ip_reputation": "unknown"
    }
    
    if not DNS_AVAILABLE:
        # Fallback: используем socket для A записи
        try:
            ip = socket.gethostbyname(domain)
            result["a_records"] = [ip]
        except:
            pass
        return result
    
    try:
        # A записи (IP адреса)
        try:
            answers = dns.resolver.resolve(domain, 'A')
            result["a_records"] = [str(rdata) for rdata in answers]
        except:
            pass
        
        # MX записи
        try:
            answers = dns.resolver.resolve(domain, 'MX')
            result["mx_records"] = [str(rdata.exchange) for rdata in answers]
        except:
            pass
        
        # NS записи
        try:
            answers = dns.resolver.resolve(domain, 'NS')
            result["ns_records"] = [str(rdata) for rdata in answers]
        except:
            pass
        
        # Получаем информацию о стране по IP (если есть A записи)
        if result["a_records"]:
            try:
                ip = result["a_records"][0]
                # Используем ipinfo.io для получения информации о стране
                resp = requests.get(f"https://ipinfo.io/{ip}/json", timeout=5)
                if resp.ok:
                    data = resp.json()
                    result["country"] = data.get("country", "Unknown")
                    result["org"] = data.get("org", "Unknown")
            except:
                pass
                
    except Exception as e:
        logger.warning(f"DNS info error for {domain}: {e}")
    
    return result


def get_domain_age_info(domain: str) -> Dict[str, Any]:
    """Пытается получить информацию о возрасте домена"""
    # Используем WHOIS через API (можно использовать whois библиотеку)
    try:
        # Простая проверка через whois API
        resp = requests.get(f"https://whoisjson.com/api/v1/whois?domain={domain}", timeout=5)
        if resp.ok:
            data = resp.json()
            created_date = data.get("created_date")
            if created_date:
                try:
                    created = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
                    age_days = (datetime.now(created.tzinfo) - created).days
                    return {
                        "created_date": created_date,
                        "age_days": age_days,
                        "is_new": age_days < 90  # Новый домен если меньше 90 дней
                    }
                except:
                    pass
    except:
        pass
    
    return {"age_days": None, "is_new": None}


def analyze_domain_full(url: str) -> Dict[str, Any]:
    """Полный анализ домена: DNS, TLS, возраст"""
    parsed = urlparse(url)
    domain = parsed.netloc.lower().replace("www.", "")
    
    logger.info(f"[DOMAIN INFO] Analyzing domain: {domain}")
    
    domain_info = {
        "domain": domain,
        "url": url,
        "tls": get_tls_info(domain),
        "dns": get_dns_info(domain),
        "age": get_domain_age_info(domain)
    }
    
    return domain_info

