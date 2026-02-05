import json
import logging
import os
import re
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

RiskLevel = Literal["Low", "Medium", "High"]


class EmailParty(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


class EmailHeaders(BaseModel):
    from_: Optional[EmailParty] = Field(default=None, alias="from")
    replyTo: Optional[EmailParty] = None
    returnPath: Optional[EmailParty] = None
    messageId: Optional[str] = None
    received: Optional[str] = None


class EmailBody(BaseModel):
    text: str = ""
    html: str = ""


class EmailLink(BaseModel):
    url: str
    finalUrl: Optional[str] = None
    finalDomain: Optional[str] = None
    error: Optional[str] = None


class EmailAttachment(BaseModel):
    name: str
    mime: Optional[str] = None
    size: Optional[int] = None


class EmailAnalyzeRequest(BaseModel):
    platform: Literal["gmail", "outlook"]
    message_key: str
    headers: Dict[str, Any] = {}
    subject: str = ""
    body: EmailBody = EmailBody()
    links: List[EmailLink] = []
    attachments: List[EmailAttachment] = []
    local_signals: Dict[str, Any] = {}


class EmailAnalyzeResponse(BaseModel):
    risk_score: int = Field(ge=0, le=100)
    risk_level: RiskLevel
    summary: str
    reasons: List[str]
    recommendations: List[str]


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def _risk_level(score: int) -> RiskLevel:
    if score >= 70:
        return "High"
    if score >= 35:
        return "Medium"
    return "Low"


def _contains_urgency(text: str) -> List[str]:
    t = (text or "").lower()
    tokens = [
        ("срочно", "Срочная формулировка в тексте"),
        ("немедленно", "Требование немедленного действия"),
        ("последнее предупреждение", "Формулировка давления/ультиматума"),
        ("подтверд", "Запрос подтверждения/перехода"),
        ("перейдите по ссылке", "Призыв перейти по ссылке"),
        ("verify", "Запрос проверки/подтверждения"),
        ("urgent", "Срочность (англ.)"),
        ("reset", "Призыв сбросить/изменить доступ"),
    ]
    hits = []
    for k, label in tokens:
        if k in t:
            hits.append(label)
    return hits[:5]


def _sanitize_for_prompt(s: str, limit: int) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s[:limit]


def _build_local_assessment(req: EmailAnalyzeRequest) -> Dict[str, Any]:
    """
    Deterministic (non-AI) signals. AI layer only explains and formats.
    """
    score = 10
    reasons: List[str] = []

    sender_domain = (req.local_signals.get("senderDomain") or "").strip()
    id_warn = req.local_signals.get("identityWarnings") or []
    link_warn = req.local_signals.get("linkWarnings") or []
    urgency_hits = req.local_signals.get("urgencyHits") or []

    if id_warn:
        score += 18
        reasons.extend(id_warn[:2])

    if link_warn:
        score += 18
        reasons.extend(link_warn[:2])

    # Redirect errors increase uncertainty (not necessarily higher risk, but we treat as attention)
    redirect_errors = [l for l in req.links if l.error]
    if redirect_errors:
        score += 8
        reasons.append("Не удалось однозначно определить конечный адрес некоторых ссылок (ограничения ответа/редиректы).")

    # Urgency / pressure
    if urgency_hits:
        score += 12
        reasons.append("В тексте есть признаки давления/срочности, требующие дополнительной проверки.")

    # Attachments metadata (only)
    if req.attachments:
        score += 6
        reasons.append("В письме присутствуют вложения; рекомендуется отдельная проверка их происхождения и формата.")

    # Many external domains
    link_domains = req.local_signals.get("linkDomains") or []
    if sender_domain and link_domains:
        external = [d for d in link_domains if d and d != sender_domain]
        if len(external) >= 2:
            score += 8
            reasons.append("В письме несколько внешних доменов ссылок, отличающихся от домена отправителя.")

    score = _clamp(score, 0, 100)
    return {
        "risk_score": score,
        "risk_level": _risk_level(score),
        "reasons": reasons[:5],
        "urgency_hits": urgency_hits,
    }


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    """
    Best-effort JSON extraction (Gemini sometimes wraps JSON in markdown fences).
    """
    if not text:
        return None
    t = text.strip()
    if "```json" in t:
        t = t.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in t:
        t = t.split("```", 1)[1].split("```", 1)[0].strip()
    try:
        return json.loads(t)
    except Exception:
        # Try to extract first {...} block
        m = re.search(r"\{[\s\S]*\}", t)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def _clean_official_ru(text: str) -> str:
    """
    Enforce neutral/official language and remove banned terms.
    """
    s = (text or "").strip()
    # Prohibited / too-strong words
    s = re.sub(r"\bвзлом\w*\b|\bатака\w*\b", "нежелательные термины", s, flags=re.IGNORECASE)
    s = re.sub(r"\bподделк\w*\b|\bфальшив\w*\b", "признаки несоответствий", s, flags=re.IGNORECASE)
    # Avoid absolutes like "точно/гарантированно"
    s = re.sub(r"\b(точно|гарантированно|однозначно)\b", "с высокой вероятностью", s, flags=re.IGNORECASE)
    return s.strip()


def _build_findings(req: EmailAnalyzeRequest, local: Dict[str, Any]) -> Dict[str, Any]:
    """
    IMPORTANT: findings are the ONLY input to AI.
    No raw email body, no direct content analysis by AI.
    """
    id_warn = (req.local_signals.get("identityWarnings") or [])[:5]
    link_warn = (req.local_signals.get("linkWarnings") or [])[:5]
    urgency_hits = (req.local_signals.get("urgencyHits") or [])[:5]
    sender_domain = (req.local_signals.get("senderDomain") or "").strip()
    link_domains = (req.local_signals.get("linkDomains") or [])[:10]

    redirect_errors = 0
    resolved_links: List[Dict[str, Any]] = []
    for l in (req.links or [])[:8]:
        if getattr(l, "error", None):
            redirect_errors += 1
        resolved_links.append(
            {
                "final_domain": (l.finalDomain or "")[:120],
                "had_resolution_error": bool(l.error),
            }
        )

    exts: List[str] = []
    for a in (req.attachments or [])[:8]:
        name = (a.name or "").strip()
        m = re.search(r"\.([a-zA-Z0-9]{1,8})$", name)
        if m:
            exts.append(m.group(1).lower())
    exts = sorted(list({e for e in exts if e}))

    return {
        "scope": "email_trust_report",
        "platform": req.platform,
        "risk": {
            "risk_score": int(local["risk_score"]),
            "risk_level": local["risk_level"],
        },
        "signals": {
            "sender_domain": sender_domain,
            "identity_warnings": id_warn,
            "link_warnings": link_warn,
            "link_domains": link_domains,
            "resolved_link_domains": resolved_links,
            "redirect_resolution_errors_count": redirect_errors,
            "urgency_indicators": urgency_hits,
            "attachments": {
                "count": len(req.attachments or []),
                "extensions": exts[:10],
            },
        },
        "limits": {
            "note": "AI получает только findings (без текста письма и без анализа содержимого).",
        },
    }


def _ai_explain(req: EmailAnalyzeRequest, local: Dict[str, Any]) -> Optional[EmailAnalyzeResponse]:
    """
    AI НЕ решает, а объясняет на базе локальных сигналов.
    Uses Google Gemini API ONLY as an explanation layer.
    Input to AI is ONLY `findings` (already verified technical results).
    """
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        logger.warning("[Email AI] GOOGLE_API_KEY not set, skipping AI explanation")
        return None

    try:
        from google import genai  # type: ignore
    except Exception as e:
        logger.warning(f"[Email AI] Google GenAI library not available: {e}")
        return None

    findings = _build_findings(req, local)

    prompt = (
        "Ты — аналитик по доверенности email (официальный, нейтральный стиль).\n"
        "ВАЖНО:\n"
        "- Ты НЕ анализируешь письмо напрямую и НЕ добавляешь новые признаки.\n"
        "- Ты объясняешь ТОЛЬКО то, что уже присутствует в объекте findings.\n"
        "- Ты НЕ принимаешь решений и НЕ делаешь категоричных выводов.\n"
        "- Запрещены слова: «взлом», «атака». Запрещено утверждать, что письмо «поддельное/фальшивое».\n"
        "- Можно говорить только про «признаки», «несоответствия», «требует дополнительной проверки».\n\n"
        "Сформируй ответ строго JSON (без markdown) такого вида:\n"
        "{\n"
        '  "summary": "1 абзац, официальный нейтральный стиль",\n'
        '  "reasons": ["3-5 пунктов, только по findings"],\n'
        '  "recommendations": ["3-5 пунктов, практические шаги"]\n'
        "}\n\n"
        "Входные данные findings:\n"
        + json.dumps(findings, ensure_ascii=False)
    )

    try:
        logger.info("[Email AI] Calling Gemini API for email trust report explanation")
        client = genai.Client(api_key=api_key)
        model_name = os.getenv("GEMINI_EMAIL_MODEL", "gemini-2.5-flash")
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        raw_text = (response.text or "").strip()
        logger.info(f"[Email AI] Gemini response received ({len(raw_text)} chars)")
        data = _extract_json_object(raw_text)
        if not data:
            logger.warning("[Email AI] Failed to extract JSON from Gemini response")
            return None
        logger.info("[Email AI] Successfully generated AI explanation for email report")

        # IMPORTANT: risk is deterministic from findings; AI only explains.
        score = int(local["risk_score"])
        level = local["risk_level"]

        summary = _clean_official_ru(str(data.get("summary", ""))) or (
            "Вывод сформирован по результатам предварительных технических проверок и анализа ссылок. "
            "Рекомендуется ручная сверка отправителя и конечных адресов перехода."
        )
        reasons = [_clean_official_ru(str(x)) for x in (data.get("reasons") or []) if str(x).strip()][:5]
        recs = [_clean_official_ru(str(x)) for x in (data.get("recommendations") or []) if str(x).strip()][:5]

        if not reasons:
            reasons = local.get("reasons", [])[:5]
        if not recs:
            recs = [
                "Проверьте совпадение домена отправителя с доменами ссылок перед переходом.",
                "При наличии вложений — проверяйте происхождение файла и тип/расширение перед открытием.",
                "При сомнениях запросите подтверждение по независимому каналу (официальный телефон/сайт).",
            ]

        return EmailAnalyzeResponse(
            risk_score=score,
            risk_level=level,
            summary=summary,
            reasons=reasons,
            recommendations=recs,
        )
    except Exception as e:
        logger.error(f"[Email AI] Gemini API error: {e}", exc_info=True)
        return None


def analyze_email(req: EmailAnalyzeRequest) -> EmailAnalyzeResponse:
    local = _build_local_assessment(req)
    ai = _ai_explain(req, local)
    if ai:
        return ai

    # Fallback (no AI configured): still return compliant, neutral response.
    score = int(local["risk_score"])
    level = local["risk_level"]
    reasons = local.get("reasons", [])
    if not reasons:
        reasons = ["Значимых несоответствий по доступным сигналам не выявлено."]

    summary = (
        "Вывод сформирован по результатам предварительного анализа метаданных письма, текста и ссылок. "
        "Результат носит справочный характер и может требовать ручной проверки."
    )
    recommendations = [
        "Сверьте домен отправителя и конечные домены ссылок перед переходом.",
        "Не открывайте вложения без проверки происхождения и соответствия формата.",
        "При сомнениях используйте официальный канал связи для подтверждения (без ответа на письмо).",
    ]

    return EmailAnalyzeResponse(
        risk_score=score,
        risk_level=level,
        summary=summary,
        reasons=reasons[:5],
        recommendations=recommendations[:5],
    )


