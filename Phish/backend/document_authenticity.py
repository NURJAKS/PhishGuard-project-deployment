import base64
import binascii
import concurrent.futures
import csv
import hashlib
import io
import json
import logging
import re
import threading
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

CheckStatus = Literal["ok", "warning", "risk"]
RiskLevel = Literal["Low", "Medium", "High"]


class CheckItem(BaseModel):
    check: str
    status: CheckStatus
    description: str


class DocumentAuthenticityResult(BaseModel):
    file_name: str
    format: str
    checks: List[CheckItem]
    risk_level: RiskLevel
    summary: str
    recommendation: str


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    progress: int = Field(ge=0, le=100)
    current_step: str
    error: Optional[str] = None
    result: Optional[DocumentAuthenticityResult] = None


@dataclass
class _JobRecord:
    status: JobStatus
    created_at: float
    updated_at: float


_JOBS_LOCK = threading.Lock()
_JOBS: Dict[str, _JobRecord] = {}

_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4)

# Hard limits to avoid zip-bombs / unbounded parsing.
MAX_INPUT_BYTES = 25 * 1024 * 1024  # 25MB
MAX_ZIP_FILES = 200
MAX_ZIP_TOTAL_UNCOMPRESSED = 50 * 1024 * 1024  # 50MB
MAX_ZIP_SINGLE_FILE = 15 * 1024 * 1024  # 15MB


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_lower_ext(filename: str) -> str:
    name = (filename or "").lower().strip()
    if "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1]


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _status_points(status: CheckStatus) -> int:
    if status == "risk":
        return 3
    if status == "warning":
        return 1
    return 0


def _risk_from_points(points: int, has_structural_risk: bool) -> RiskLevel:
    # Structural corruption -> High immediately.
    if has_structural_risk:
        return "High"
    if points >= 6:
        return "High"
    if points >= 2:
        return "Medium"
    return "Low"


def _render_summary_and_reco(risk: RiskLevel, checks: List[CheckItem]) -> Tuple[str, str]:
    # Deterministic, report-friendly wording. No "поддельный".
    risk_items = [c for c in checks if c.status == "risk"]
    warn_items = [c for c in checks if c.status == "warning"]

    if risk == "High":
        summary = (
            "Обнаружены выраженные признаки несоответствий и/или вмешательства в структуру файла. "
            "Это повышает риск того, что документ мог быть изменён или собран из разных источников."
        )
        reco = (
            "Запросите исходник из первоисточника и/или документ с подтверждением (ЭЦП/подписанный оригинал). "
            "Сверьте реквизиты и ключевые поля с внешними реестрами/системами учёта. "
            "При наличии подписи — выполните проверку подписи по доверенной цепочке."
        )
        if any("Целостность структуры" in x.check for x in risk_items):
            reco = (
                "Документ стоит получить повторно из первоисточника: есть признаки проблем с целостностью структуры. "
                "Далее выполните повторную проверку подписи/метаданных и сравнение с эталонным документом."
            )
        return summary, reco

    if risk == "Medium":
        summary = (
            "Найдены подозрительные признаки в метаданных или структуре документа. "
            "Это не доказывает нарушения, но требует дополнительной сверки."
        )
        reco = (
            "Сверьте ключевые поля с первоисточником (дата, реквизиты, суммы, печати/подписи). "
            "Если документ подписан — проверьте подпись и факт изменений после подписи. "
            "При необходимости запросите повторную выгрузку из исходной системы."
        )
        return summary, reco

    # Low
    summary = (
        "Явных технических несоответствий не обнаружено. "
        "Документ выглядит согласованным по метаданным и структуре, но всегда стоит сверять критичные поля."
    )
    reco = "Для надёжности сверяйте ключевые реквизиты и даты с первоисточником и/или реестрами."
    return summary, reco


def _format_name_from_detection(ext: str, magic: bytes) -> str:
    if magic.startswith(b"%PDF-"):
        return "PDF"
    if magic.startswith(b"PK\x03\x04"):
        # OOXML / ODF / ZIP container; decide by inner structure later.
        return "ZIP"
    if magic.startswith(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"):
        return "OLE"
    if magic.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if magic.startswith(b"\xFF\xD8\xFF"):
        return "JPG"
    if magic.startswith(b"II*\x00") or magic.startswith(b"MM\x00*"):
        return "TIFF"
    if magic.startswith(b"<?xml") or magic.startswith(b"\xef\xbb\xbf<?xml"):
        return "XML"
    if ext:
        return ext.strip(".").upper()
    return "UNKNOWN"


def _detect_format(filename: str, content: bytes) -> str:
    ext = _safe_lower_ext(filename)
    magic = content[:16]

    # Prefer extension when unambiguous.
    if ext in {".pdf"}:
        return "PDF"
    if ext in {".docx"}:
        return "DOCX"
    if ext in {".xlsx"}:
        return "XLSX"
    if ext in {".pptx"}:
        return "PPTX"
    if ext in {".odt"}:
        return "ODT"
    if ext in {".ods"}:
        return "ODS"
    if ext in {".odp"}:
        return "ODP"
    if ext in {".jpg", ".jpeg"}:
        return "JPG"
    if ext in {".png"}:
        return "PNG"
    if ext in {".tif", ".tiff"}:
        return "TIFF"
    if ext in {".heic"}:
        return "HEIC"
    if ext in {".xml"}:
        return "XML"
    if ext in {".csv"}:
        return "CSV"
    if ext in {".zip"}:
        return "ZIP"
    if ext in {".doc", ".xls", ".ppt"}:
        return ext.strip(".").upper()  # legacy OLE

    # Fallback to magic
    base = _format_name_from_detection(ext, magic)
    return base


def _generic_checks(filename: str, content: bytes) -> Tuple[List[CheckItem], Dict[str, Any], bool]:
    """
    Returns (checks, extracted_metadata, has_structural_risk)
    """
    checks: List[CheckItem] = []
    meta: Dict[str, Any] = {}
    has_structural_risk = False

    # 1) Basic structure integrity
    fmt = _detect_format(filename, content)
    try:
        if fmt == "PDF":
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            _ = len(reader.pages)
        elif fmt in {"DOCX", "XLSX", "PPTX", "ODT", "ODS", "ODP", "ZIP"}:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                zf.testzip()  # returns first bad file name or None
        elif fmt in {"JPG", "PNG", "TIFF"}:
            from PIL import Image
            img = Image.open(io.BytesIO(content))
            img.verify()
        elif fmt == "XML":
            import xml.etree.ElementTree as ET
            ET.fromstring(content.lstrip(b"\xef\xbb\xbf"))
        elif fmt == "CSV":
            content.decode("utf-8", errors="strict")  # strict by default
        elif fmt in {"DOC", "XLS", "PPT", "OLE"}:
            try:
                import olefile  # type: ignore
                ole = olefile.OleFileIO(io.BytesIO(content))
                ole.close()
            except Exception:
                # We'll keep going but mark as warning (legacy formats).
                pass
        else:
            # Unknown: no structural validation possible.
            pass

        checks.append(
            CheckItem(
                check="Целостность структуры файла",
                status="ok",
                description="Файл читается корректно, критичных ошибок структуры не обнаружено.",
            )
        )
    except Exception as e:
        has_structural_risk = True
        checks.append(
            CheckItem(
                check="Целостность структуры файла",
                status="risk",
                description=f"Есть признаки нарушения структуры или повреждения файла (ошибка чтения: {type(e).__name__}).",
            )
        )

    # 2) Metadata extraction (best-effort)
    try:
        meta = extract_metadata(filename, content)
        if meta:
            checks.append(
                CheckItem(
                    check="Анализ метаданных",
                    status="ok",
                    description="Метаданные извлечены и пригодны для сверки (даты, автор, ПО и т.п.).",
                )
            )
        else:
            checks.append(
                CheckItem(
                    check="Анализ метаданных",
                    status="warning",
                    description="Метаданные отсутствуют или минимальны; это усложняет сверку источника и истории документа.",
                )
            )
    except Exception:
        checks.append(
            CheckItem(
                check="Анализ метаданных",
                status="warning",
                description="Не удалось извлечь метаданные; возможно, формат нестандартный или файл защищён.",
            )
        )

    # 3) Date consistency
    date_checks = _check_date_consistency(meta)
    checks.extend(date_checks)

    # 4) Re-save traces (generic heuristics)
    resave = _check_resave_traces(filename, content, meta)
    checks.extend(resave)

    return checks, meta, has_structural_risk


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        s = value.strip()
        # common ISO-ish / PDF-like
        for fmt in (
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ):
            try:
                dt = datetime.strptime(s, fmt)
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
        # PDF date format D:YYYYMMDDHHmmSS
        m = re.match(r"^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?", s)
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            hh = int(m.group(4) or 0)
            mm = int(m.group(5) or 0)
            ss = int(m.group(6) or 0)
            return datetime(y, mo, d, hh, mm, ss, tzinfo=timezone.utc)
    return None


def _check_date_consistency(meta: Dict[str, Any]) -> List[CheckItem]:
    created = _parse_dt(meta.get("created"))
    modified = _parse_dt(meta.get("modified"))
    printed = _parse_dt(meta.get("printed"))
    now = datetime.now(timezone.utc)
    items: List[CheckItem] = []

    if not any([created, modified, printed]):
        items.append(
            CheckItem(
                check="Согласованность дат",
                status="warning",
                description="В метаданных нет дат создания/изменения; историю документа сложнее подтвердить.",
            )
        )
        return items

    anomalies = []
    if created and modified and created > modified:
        anomalies.append("дата создания позже даты изменения")
    if printed and created and printed < created:
        anomalies.append("дата печати раньше даты создания")
    for label, dt in [("создания", created), ("изменения", modified), ("печати", printed)]:
        if dt and dt > (now.replace(year=now.year + 1)):
            anomalies.append(f"дата {label} в будущем")
        if dt and dt < datetime(1995, 1, 1, tzinfo=timezone.utc):
            anomalies.append(f"дата {label} слишком старая для современного документа")

    if anomalies:
        items.append(
            CheckItem(
                check="Согласованность дат",
                status="warning",
                description="Обнаружены несоответствия дат: " + "; ".join(sorted(set(anomalies))) + ".",
            )
        )
    else:
        items.append(
            CheckItem(
                check="Согласованность дат",
                status="ok",
                description="Даты в метаданных выглядят согласованно (без явных противоречий).",
            )
        )
    return items


def _check_resave_traces(filename: str, content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    fmt = _detect_format(filename, content)
    items: List[CheckItem] = []

    creator = (meta.get("creator") or meta.get("application") or "").strip()
    producer = (meta.get("producer") or "").strip()

    if fmt == "PDF":
        eof_count = content.count(b"%%EOF")
        if eof_count >= 2:
            items.append(
                CheckItem(
                    check="Следы повторного сохранения",
                    status="warning",
                    description="PDF содержит несколько маркеров окончания (%%EOF), что обычно указывает на последовательные сохранения/инкрементальные обновления.",
                )
            )
        elif creator or producer:
            items.append(
                CheckItem(
                    check="Следы повторного сохранения",
                    status="ok",
                    description="PDF содержит стандартные признаки формирования (Creator/Producer) без явных следов многократного пересохранения.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Следы повторного сохранения",
                    status="warning",
                    description="В PDF не обнаружены типичные поля Creator/Producer; это может быть нормой, но усложняет подтверждение происхождения.",
                )
            )
        return items

    # Images: Software tag or obvious editor strings in bytes
    if fmt in {"JPG", "PNG", "TIFF", "HEIC"}:
        lower_bytes = content[:200000].lower()
        editor_hits = []
        for token in [b"photoshop", b"adobe", b"gimp", b"affinity", b"lightroom", b"paint.net"]:
            if token in lower_bytes:
                editor_hits.append(token.decode("ascii", errors="ignore"))
        software = (meta.get("software") or "").strip()
        if software:
            editor_hits.append(software)
        if editor_hits:
            items.append(
                CheckItem(
                    check="Следы повторного сохранения",
                    status="warning",
                    description="Есть признаки сохранения через графический редактор/ПО: " + ", ".join(sorted(set(editor_hits))) + ".",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Следы повторного сохранения",
                    status="ok",
                    description="Явных признаков пересохранения через редакторы в метаданных/заголовках не найдено.",
                )
            )
        return items

    # OOXML/ODF: revision / editing time hints
    rev = meta.get("revision")
    total_time = meta.get("total_time_minutes")
    if rev and isinstance(rev, int) and rev >= 10:
        items.append(
            CheckItem(
                check="Следы повторного сохранения",
                status="warning",
                description=f"Указано большое число ревизий/сохранений (revision={rev}), что может означать активную историю правок.",
            )
        )
    elif total_time and isinstance(total_time, int) and total_time >= 600:
        items.append(
            CheckItem(
                check="Следы повторного сохранения",
                status="warning",
                description=f"Метаданные указывают на длительное редактирование (≈{total_time} мин).",
            )
        )
    else:
        items.append(
            CheckItem(
                check="Следы повторного сохранения",
                status="ok",
                description="Явных признаков многократного пересохранения по метаданным не обнаружено.",
            )
        )
    return items


def extract_metadata(filename: str, content: bytes) -> Dict[str, Any]:
    fmt = _detect_format(filename, content)

    if fmt == "PDF":
        return _extract_pdf_metadata(content)
    if fmt in {"DOCX", "XLSX", "PPTX"}:
        return _extract_ooxml_metadata(content)
    if fmt in {"ODT", "ODS", "ODP"}:
        return _extract_odf_metadata(content)
    if fmt in {"JPG", "PNG", "TIFF", "HEIC"}:
        return _extract_image_metadata(fmt, content)
    if fmt in {"DOC", "XLS", "PPT", "OLE"}:
        return _extract_ole_metadata(content)
    if fmt == "XML":
        return _extract_xml_metadata(content)
    if fmt == "CSV":
        return {"encoding_hint": "utf-8"}
    if fmt == "ZIP":
        return {"container": "zip", "sha256": _sha256_hex(content)}
    return {"sha256": _sha256_hex(content)}


def _extract_pdf_metadata(content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(content))
    info = reader.metadata or {}
    # PyPDF2 returns keys like '/Creator'
    def _get(k: str) -> Optional[str]:
        v = info.get(k)
        if v is None:
            return None
        return str(v)

    meta["creator"] = _get("/Creator") or _get("Creator")
    meta["producer"] = _get("/Producer") or _get("Producer")
    meta["author"] = _get("/Author") or _get("Author")
    meta["title"] = _get("/Title") or _get("Title")
    meta["created"] = _get("/CreationDate") or _get("CreationDate")
    meta["modified"] = _get("/ModDate") or _get("ModDate")

    # PDF/A hint (XMP)
    try:
        xmp = reader.xmp_metadata  # may be None
        if xmp:
            # best-effort: presence indicates XMP exists; PDF/A often includes pdfaid
            raw = str(xmp)
            if "pdfaid" in raw.lower():
                meta["pdfa_hint"] = True
    except Exception:
        pass
    return {k: v for k, v in meta.items() if v not in (None, "", "None")}


def _read_zip_text(zf: zipfile.ZipFile, name: str, max_bytes: int = 2_000_000) -> Optional[str]:
    try:
        with zf.open(name) as fp:
            data = fp.read(max_bytes)
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return None


def _extract_ooxml_metadata(content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        core = _read_zip_text(zf, "docProps/core.xml")
        app = _read_zip_text(zf, "docProps/app.xml")
        if core:
            meta.update(_parse_ooxml_core(core))
        if app:
            meta.update(_parse_ooxml_app(app))
        meta["has_digital_signature"] = _ooxml_has_signature(zf)
    return {k: v for k, v in meta.items() if v not in (None, "", "None")}


def _parse_ooxml_core(xml_text: str) -> Dict[str, Any]:
    import xml.etree.ElementTree as ET
    out: Dict[str, Any] = {}
    root = ET.fromstring(xml_text.encode("utf-8", errors="ignore"))
    # Namespaces vary; match by localname
    def find_text(local: str) -> Optional[str]:
        for el in root.iter():
            if el.tag.endswith("}" + local) or el.tag == local:
                if el.text:
                    return el.text.strip()
        return None

    out["created"] = find_text("created")
    out["modified"] = find_text("modified")
    out["creator"] = find_text("creator")
    out["last_modified_by"] = find_text("lastModifiedBy")
    rev = find_text("revision")
    if rev and rev.isdigit():
        out["revision"] = int(rev)
    return out


def _parse_ooxml_app(xml_text: str) -> Dict[str, Any]:
    import xml.etree.ElementTree as ET
    out: Dict[str, Any] = {}
    root = ET.fromstring(xml_text.encode("utf-8", errors="ignore"))
    def find_text(local: str) -> Optional[str]:
        for el in root.iter():
            if el.tag.endswith("}" + local) or el.tag == local:
                if el.text:
                    return el.text.strip()
        return None

    out["application"] = find_text("Application")
    out["company"] = find_text("Company")
    total = find_text("TotalTime")
    if total and total.isdigit():
        out["total_time_minutes"] = int(total)
    return out


def _ooxml_has_signature(zf: zipfile.ZipFile) -> bool:
    names = set(zf.namelist())
    if any(n.startswith("_xmlsignatures/") for n in names):
        return True
    ct = None
    try:
        ct = _read_zip_text(zf, "[Content_Types].xml")
    except Exception:
        ct = None
    if ct and "digital-signature" in ct.lower():
        return True
    return False


def _extract_odf_metadata(content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        meta_xml = _read_zip_text(zf, "meta.xml")
        if meta_xml:
            meta.update(_parse_odf_meta(meta_xml))
        meta["has_digital_signature"] = any(
            n.lower() == "meta-inf/documentsignatures.xml" for n in zf.namelist()
        )
    return {k: v for k, v in meta.items() if v not in (None, "", "None")}


def _parse_odf_meta(xml_text: str) -> Dict[str, Any]:
    import xml.etree.ElementTree as ET
    out: Dict[str, Any] = {}
    root = ET.fromstring(xml_text.encode("utf-8", errors="ignore"))
    def find_text(local: str) -> Optional[str]:
        for el in root.iter():
            if el.tag.endswith("}" + local) or el.tag == local:
                if el.text:
                    return el.text.strip()
        return None

    out["creator"] = find_text("creator")
    out["created"] = find_text("creation-date") or find_text("date")
    out["modified"] = find_text("date")
    out["generator"] = find_text("generator")
    return out


def _extract_image_metadata(fmt: str, content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(content))
        meta["width"] = img.size[0]
        meta["height"] = img.size[1]
        meta["mode"] = img.mode
        meta["format"] = img.format

        exif = None
        try:
            exif = img.getexif()
        except Exception:
            exif = None

        if exif:
            # Common EXIF tags
            tag_map = {
                306: "modified",        # DateTime
                36867: "created",       # DateTimeOriginal
                36868: "digitized",     # DateTimeDigitized
                271: "make",
                272: "model",
                305: "software",
                315: "artist",
            }
            for tid, key in tag_map.items():
                if tid in exif:
                    try:
                        meta[key] = str(exif.get(tid))
                    except Exception:
                        pass
    except Exception:
        # HEIC often not supported without extra codec.
        if fmt == "HEIC":
            meta["heic_decoder"] = "missing"
    return {k: v for k, v in meta.items() if v not in (None, "", "None")}


def _extract_ole_metadata(content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    try:
        import olefile  # type: ignore
        ole = olefile.OleFileIO(io.BytesIO(content))
        if ole.exists("\x05SummaryInformation"):
            props = ole.getproperties("\x05SummaryInformation")
            meta["title"] = props.get(2)
            meta["subject"] = props.get(3)
            meta["author"] = props.get(4)
            meta["created"] = props.get(12)  # create time
            meta["modified"] = props.get(13)  # last save time
            meta["application"] = props.get(18)
        ole.close()
    except Exception:
        pass
    return {k: v for k, v in meta.items() if v not in (None, "", "None")}


def _extract_xml_metadata(content: bytes) -> Dict[str, Any]:
    meta: Dict[str, Any] = {}
    raw = content.lstrip(b"\xef\xbb\xbf")
    meta["has_xml_signature"] = b"<Signature" in raw or b":Signature" in raw
    meta["encoding_hint"] = "utf-8"
    return meta


def _pdf_specific_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    # Signature presence: ByteRange is common for PDF signatures.
    has_sig = b"/ByteRange" in content and b"/Contents" in content
    if has_sig:
        # We can detect presence reliably, but full validation requires PKI and a specialized library.
        items.append(
            CheckItem(
                check="Цифровая подпись (PDF)",
                status="warning",
                description="В документе есть признаки цифровой подписи (ByteRange/Contents). Криптографическая проверка подписи и доверенной цепочки требует отдельной проверки в доверенной среде.",
            )
        )
        # Basic heuristic: if multiple EOF markers, could be incremental update after signing.
        if content.count(b"%%EOF") >= 2:
            items.append(
                CheckItem(
                    check="Изменения после подписи (PDF)",
                    status="warning",
                    description="PDF содержит инкрементальные обновления (несколько %%EOF). Это может быть нормой, но требует проверки: не вносились ли изменения после подписания.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Изменения после подписи (PDF)",
                    status="ok",
                    description="Явных признаков инкрементальных обновлений после формирования файла не обнаружено.",
                )
            )
    else:
        items.append(
            CheckItem(
                check="Цифровая подпись (PDF)",
                status="warning",
                description="Цифровая подпись не обнаружена. Для официальных документов рекомендуется наличие проверяемой подписи/ЭЦП.",
            )
        )

    # Images / scan overlay heuristic
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(content))
        pages_with_images = 0
        pages_with_text = 0
        for p in reader.pages[:10]:  # cap for speed
            txt = (p.extract_text() or "").strip()
            if txt:
                pages_with_text += 1
            # Look for XObject images
            resources = p.get("/Resources") or {}
            xobj = resources.get("/XObject") if isinstance(resources, dict) else None
            has_img = False
            if isinstance(xobj, dict):
                for _, obj in xobj.items():
                    try:
                        o = obj.get_object()
                        if o.get("/Subtype") == "/Image":
                            has_img = True
                            break
                    except Exception:
                        continue
            if has_img:
                pages_with_images += 1
        if pages_with_images > 0 and pages_with_text > 0 and pages_with_images >= pages_with_text:
            items.append(
                CheckItem(
                    check="Признаки «скан + текст поверх» (PDF)",
                    status="warning",
                    description="Обнаружены страницы с изображениями и извлекаемым текстом. Это может быть OCR/слой текста поверх скана; стоит дополнительно сверить штампы/подписи и согласованность шрифтов.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Признаки «скан + текст поверх» (PDF)",
                    status="ok",
                    description="Явных признаков сочетания скан-изображения и текстового слоя поверх не найдено (эвристика).",
                )
            )
    except Exception:
        # ignore
        pass

    # PDF/A hint
    if meta.get("pdfa_hint"):
        items.append(
            CheckItem(
                check="PDF/A совместимость",
                status="ok",
                description="Есть признаки PDF/A (по XMP). Это обычно повышает воспроизводимость и стабильность отображения.",
            )
        )
    return items


def _ooxml_docx_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        names = set(zf.namelist())

        # Signature
        if meta.get("has_digital_signature"):
            items.append(
                CheckItem(
                    check="Цифровая подпись (DOCX)",
                    status="warning",
                    description="В пакете обнаружены компоненты цифровой подписи. Для статуса «валидна» требуется криптографическая проверка сертификата и цепочки доверия.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Цифровая подпись (DOCX)",
                    status="warning",
                    description="Цифровая подпись не обнаружена. Для официальных документов рекомендуется наличие проверяемой подписи/ЭЦП.",
                )
            )

        # Track changes / revision history
        settings = _read_zip_text(zf, "word/settings.xml")
        if settings and ("trackRevisions" in settings):
            items.append(
                CheckItem(
                    check="История правок (DOCX)",
                    status="warning",
                    description="В документе включён режим отслеживания правок (track changes). Это не является нарушением, но требует внимания при подтверждении финальной версии.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="История правок (DOCX)",
                    status="ok",
                    description="Явных признаков включённого отслеживания правок не найдено.",
                )
            )

        # Comments
        if "word/comments.xml" in names or any(n.startswith("word/comments") for n in names):
            items.append(
                CheckItem(
                    check="Комментарии и примечания (DOCX)",
                    status="warning",
                    description="В документе есть комментарии/примечания. Для официальной версии обычно требуется их очистка или отдельное согласование.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Комментарии и примечания (DOCX)",
                    status="ok",
                    description="Комментарии/примечания не обнаружены.",
                )
            )

        # Hidden text (w:vanish)
        doc_xml = _read_zip_text(zf, "word/document.xml")
        if doc_xml and ("w:vanish" in doc_xml or "w:webHidden" in doc_xml):
            items.append(
                CheckItem(
                    check="Скрытый текст (DOCX)",
                    status="warning",
                    description="Обнаружены признаки скрытого текста (vanish/webHidden). Рекомендуется проверить, что скрытые фрагменты не влияют на смысл документа.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Скрытый текст (DOCX)",
                    status="ok",
                    description="Явных признаков скрытого текста не найдено.",
                )
            )

        # Font mixing heuristic: multiple fonts within same paragraph
        if doc_xml:
            mixed = _docx_font_mixing_heuristic(doc_xml)
            if mixed["paragraphs_with_mixed_fonts"] >= 3:
                items.append(
                    CheckItem(
                        check="Анализ шрифтов (DOCX)",
                        status="warning",
                        description=f"Есть абзацы с несколькими шрифтами внутри одного абзаца (найдено: {mixed['paragraphs_with_mixed_fonts']}). Это может быть нормальной вёрсткой, но также встречается при «склейке» фрагментов.",
                    )
                )
            else:
                items.append(
                    CheckItem(
                        check="Анализ шрифтов (DOCX)",
                        status="ok",
                        description="Сильного смешения шрифтов внутри абзацев не обнаружено (эвристика).",
                    )
                )
    return items


def _docx_font_mixing_heuristic(document_xml: str) -> Dict[str, int]:
    import xml.etree.ElementTree as ET
    # Parse with best-effort; DOCX XML is namespaced
    out = {"paragraphs_with_mixed_fonts": 0}
    try:
        root = ET.fromstring(document_xml.encode("utf-8", errors="ignore"))
    except Exception:
        return out
    # In WordprocessingML, paragraphs are w:p, runs are w:r, fonts in w:rFonts
    for p in root.iter():
        if not (p.tag.endswith("}p") or p.tag == "p"):
            continue
        fonts = set()
        for r in p.iter():
            if r.tag.endswith("}rFonts") or r.tag == "rFonts":
                # attributes may include ascii, hAnsi, cs
                for _, v in r.attrib.items():
                    if v:
                        fonts.add(v)
        # If we collected 2+ fonts for the paragraph, mark
        if len(fonts) >= 2:
            out["paragraphs_with_mixed_fonts"] += 1
    return out


def _ooxml_xlsx_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        # Signature
        if meta.get("has_digital_signature"):
            items.append(
                CheckItem(
                    check="Цифровая подпись (XLSX)",
                    status="warning",
                    description="В пакете обнаружены компоненты цифровой подписи. Для статуса «валидна» требуется криптографическая проверка сертификата и цепочки доверия.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Цифровая подпись (XLSX)",
                    status="warning",
                    description="Цифровая подпись не обнаружена. Для регламентных отчётов рекомендуется наличие проверяемой подписи/ЭЦП.",
                )
            )

        wb = _read_zip_text(zf, "xl/workbook.xml")
        hidden = 0
        if wb:
            hidden = len(re.findall(r'state="(hidden|veryHidden)"', wb))
        if hidden > 0:
            items.append(
                CheckItem(
                    check="Скрытые элементы (XLSX)",
                    status="warning",
                    description=f"Обнаружены скрытые листы (кол-во: {hidden}). Рекомендуется проверить, нет ли в них важных данных или формул.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Скрытые элементы (XLSX)",
                    status="ok",
                    description="Скрытых листов по workbook.xml не обнаружено.",
                )
            )

        # Comments / formulas heuristic
        names = zf.namelist()
        has_comments = any(n.startswith("xl/comments") for n in names)
        has_vba = any(n.endswith("vbaProject.bin") for n in names)
        has_formulas = False
        # scan first few sheets
        for n in names:
            if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"):
                xml = _read_zip_text(zf, n, max_bytes=800000) or ""
                if "<f" in xml:
                    has_formulas = True
                    break
        if has_vba:
            items.append(
                CheckItem(
                    check="Макросы/встроенный код (XLSX)",
                    status="warning",
                    description="Обнаружен компонент vbaProject.bin (макросы). Это не признак подмены, но требует отдельной проверки происхождения и назначения.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Макросы/встроенный код (XLSX)",
                    status="ok",
                    description="Признаков макросов (vbaProject.bin) не найдено.",
                )
            )

        if has_comments:
            items.append(
                CheckItem(
                    check="Комментарии (XLSX)",
                    status="warning",
                    description="В документе есть комментарии. Для финальной версии обычно требуется их очистка или отдельное согласование.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Комментарии (XLSX)",
                    status="ok",
                    description="Комментарии не обнаружены.",
                )
            )

        if has_formulas:
            items.append(
                CheckItem(
                    check="Формулы (XLSX)",
                    status="ok",
                    description="В документе обнаружены формулы (это ожидаемо для таблиц). Рекомендуется сверить критичные вычисления с первоисточником.",
                )
            )
        else:
            items.append(
                CheckItem(
                    check="Формулы (XLSX)",
                    status="ok",
                    description="Явных формул в первых листах не обнаружено (эвристика).",
                )
            )
    return items


def _ooxml_pptx_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    if meta.get("has_digital_signature"):
        items.append(
            CheckItem(
                check="Цифровая подпись (PPTX)",
                status="warning",
                description="В пакете обнаружены компоненты цифровой подписи. Для статуса «валидна» требуется криптографическая проверка сертификата и цепочки доверия.",
            )
        )
    else:
        items.append(
            CheckItem(
                check="Цифровая подпись (PPTX)",
                status="warning",
                description="Цифровая подпись не обнаружена. Для официальных презентаций рекомендуется наличие проверяемой подписи/ЭЦП при необходимости.",
            )
        )
    return items


def _odf_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    if meta.get("has_digital_signature"):
        items.append(
            CheckItem(
                check="Цифровая подпись (ODF)",
                status="warning",
                description="Обнаружены признаки подписи ODF. Для статуса «валидна» нужна криптографическая проверка подписи в доверенной среде.",
            )
        )
    else:
        items.append(
            CheckItem(
                check="Цифровая подпись (ODF)",
                status="warning",
                description="Подпись ODF не обнаружена. Для регламентных документов рекомендуется проверяемая подпись/ЭЦП.",
            )
        )
    # Hidden layers/text heuristic
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            content_xml = _read_zip_text(zf, "content.xml") or ""
            if "text:hidden-text" in content_xml or "draw:layer" in content_xml:
                items.append(
                    CheckItem(
                        check="Скрытые элементы (ODF)",
                        status="warning",
                        description="Обнаружены признаки скрытого текста/слоёв (эвристика по content.xml). Рекомендуется открыть документ в редакторе и проверить скрытые элементы.",
                    )
                )
            else:
                items.append(
                    CheckItem(
                        check="Скрытые элементы (ODF)",
                        status="ok",
                        description="Явных признаков скрытых элементов по content.xml не найдено (эвристика).",
                    )
                )
    except Exception:
        pass
    return items


def _image_checks(fmt: str, content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    if fmt == "HEIC" and meta.get("heic_decoder") == "missing":
        items.append(
            CheckItem(
                check="Чтение изображения (HEIC)",
                status="warning",
                description="HEIC не удалось разобрать в текущем окружении (нужен декодер HEIC/libheif). Без этого часть проверок недоступна.",
            )
        )
        return items

    # EXIF presence / device
    if any(k in meta for k in ("make", "model", "created", "modified", "software")):
        details = []
        if meta.get("make") or meta.get("model"):
            details.append("устройство: " + " ".join([str(meta.get("make", "")), str(meta.get("model", ""))]).strip())
        if meta.get("software"):
            details.append("ПО: " + str(meta.get("software")))
        items.append(
            CheckItem(
                check="EXIF и источник (Image)",
                status="ok",
                description="EXIF данные присутствуют (" + "; ".join([d for d in details if d]) + ").",
            )
        )
    else:
        items.append(
            CheckItem(
                check="EXIF и источник (Image)",
                status="warning",
                description="EXIF данные отсутствуют или минимальны. Это снижает возможность подтвердить источник/устройство.",
            )
        )

    # Basic splicing heuristic: tile sharpness variance
    try:
        from PIL import Image
        import numpy as np  # type: ignore
        img = Image.open(io.BytesIO(content)).convert("L")
        w, h = img.size
        # Downscale for speed
        img_small = img.resize((max(64, w // 8), max(64, h // 8)))
        arr = np.array(img_small, dtype=np.float32)
        # Laplacian-like approximation using simple differences
        dx = np.abs(arr[:, 1:] - arr[:, :-1])
        dy = np.abs(arr[1:, :] - arr[:-1, :])
        score = float(dx.mean() + dy.mean())
        # Very low score could indicate heavy blur / recompression; very high could be sharp text.
        # We'll use tile variance to detect inconsistent regions.
        tiles = 4
        tw, th = arr.shape[1] // tiles, arr.shape[0] // tiles
        vals = []
        for ty in range(tiles):
            for tx in range(tiles):
                tile = arr[ty * th : (ty + 1) * th, tx * tw : (tx + 1) * tw]
                if tile.size:
                    vals.append(float(tile.var()))
        if vals:
            ratio = (max(vals) / (min(vals) + 1e-6))
            if ratio >= 8.0:
                items.append(
                    CheckItem(
                        check="Неравномерное качество участков (Image)",
                        status="warning",
                        description="Найдены участки с заметно разным уровнем деталей/шума. Это может встречаться при вставке фрагментов или локальном редактировании, стоит визуально сверить штампы/подписи.",
                    )
                )
            else:
                items.append(
                    CheckItem(
                        check="Неравномерное качество участков (Image)",
                        status="ok",
                        description="Резких перепадов качества между участками не обнаружено (эвристика).",
                    )
                )
    except Exception:
        # numpy might be missing; keep it graceful
        items.append(
            CheckItem(
                check="Неравномерное качество участков (Image)",
                status="warning",
                description="Эвристика качества недоступна в текущем окружении (не хватает библиотек).",
            )
        )
    return items


def _xml_checks(content: bytes, meta: Dict[str, Any]) -> List[CheckItem]:
    items: List[CheckItem] = []
    raw = content.lstrip(b"\xef\xbb\xbf")
    has_sig = bool(meta.get("has_xml_signature"))
    if not has_sig:
        items.append(
            CheckItem(
                check="ЭЦП/подпись (XML)",
                status="warning",
                description="Элементы XMLDSIG подписи не обнаружены. Для регламентных XML-документов часто требуется ЭЦП.",
            )
        )
        return items

    # Verify crypto if signxml present; otherwise warning.
    try:
        from signxml import XMLVerifier  # type: ignore
        import lxml.etree as LET  # type: ignore
        doc = LET.fromstring(raw)
        XMLVerifier().verify(doc)
        items.append(
            CheckItem(
                check="ЭЦП/подпись (XML)",
                status="ok",
                description="Криптографическая проверка XML подписи прошла успешно (целостность подписанных данных подтверждена). Доверие к сертификату требует отдельной проверки цепочки.",
            )
        )
        items.append(
            CheckItem(
                check="Изменения после подписи (XML)",
                status="ok",
                description="Подписанные элементы соответствуют подписи (по результату криптографической проверки).",
            )
        )
    except Exception:
        items.append(
            CheckItem(
                check="ЭЦП/подпись (XML)",
                status="warning",
                description="В XML есть элементы подписи, но в текущем окружении не удалось выполнить криптографическую проверку. Рекомендуется проверить подпись в доверенном ПО/сервисе.",
            )
        )
        items.append(
            CheckItem(
                check="Изменения после подписи (XML)",
                status="warning",
                description="Без криптографической проверки нельзя надёжно подтвердить отсутствие изменений после подписания.",
            )
        )
    return items


def _csv_checks(content: bytes) -> List[CheckItem]:
    items: List[CheckItem] = []
    try:
        text = content.decode("utf-8")
        sample = text[:4096]
        dialect = csv.Sniffer().sniff(sample)
        items.append(
            CheckItem(
                check="Целостность структуры (CSV)",
                status="ok",
                description=f"CSV читается корректно, разделитель: '{dialect.delimiter}'.",
            )
        )
    except Exception:
        items.append(
            CheckItem(
                check="Целостность структуры (CSV)",
                status="warning",
                description="CSV не удалось корректно распознать по UTF-8/структуре. Рекомендуется проверить кодировку и разделители.",
            )
        )
    return items


def _zip_checks(filename: str, content: bytes) -> Tuple[List[CheckItem], List[DocumentAuthenticityResult]]:
    """
    Returns (container_checks, inner_results)
    """
    items: List[CheckItem] = []
    inner_results: List[DocumentAuthenticityResult] = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        names = zf.namelist()
        if len(names) > MAX_ZIP_FILES:
            items.append(
                CheckItem(
                    check="ZIP: безопасность распаковки",
                    status="risk",
                    description=f"В архиве слишком много файлов ({len(names)}). Это похоже на рискованный пакет/zip-bomb и требует ручной обработки.",
                )
            )
            return items, inner_results

        total_uncompressed = 0
        bad_names = []
        for info in zf.infolist():
            total_uncompressed += int(info.file_size)
            if info.file_size > MAX_ZIP_SINGLE_FILE:
                bad_names.append(info.filename)
            # path traversal guard
            p = Path(info.filename)
            if p.is_absolute() or ".." in p.parts:
                bad_names.append(info.filename)

        if total_uncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED:
            items.append(
                CheckItem(
                    check="ZIP: безопасность распаковки",
                    status="risk",
                    description="Суммарный распакованный размер архива слишком велик. Это повышает риск zip-bomb и требует ограничения/ручной обработки.",
                )
            )
            return items, inner_results

        if bad_names:
            items.append(
                CheckItem(
                    check="ZIP: безопасность распаковки",
                    status="risk",
                    description="Обнаружены подозрительные пути/слишком большие файлы внутри архива. Рекомендуется ручная проверка содержимого.",
                )
            )
            return items, inner_results

        items.append(
            CheckItem(
                check="ZIP: безопасность распаковки",
                status="ok",
                description=f"Архив выглядит безопасным для анализа (файлов: {len(names)}, суммарно распаковано: ~{total_uncompressed} байт).",
            )
        )

        # Analyze each file inside (best-effort)
        for info in zf.infolist():
            if info.is_dir():
                continue
            # Skip very large files (already bounded)
            data = zf.read(info.filename)
            inner_results.append(analyze_document_authenticity(info.filename, data))

        # Cross-file metadata consistency
        created_dates = []
        modified_dates = []
        for r in inner_results:
            # parse from check descriptions is messy; we rely on per-file metadata extraction via internal function
            pass
        # Basic: if archive contains unrelated executables or scripts, warn
        suspicious = [n for n in names if _safe_lower_ext(n) in {".exe", ".js", ".vbs", ".ps1", ".bat", ".cmd"}]
        if suspicious:
            items.append(
                CheckItem(
                    check="ZIP: лишние файлы",
                    status="warning",
                    description="В архиве есть лишние/нетипичные файлы для пакета документов: " + ", ".join(suspicious[:10]) + ("" if len(suspicious) <= 10 else " ..."),
                )
            )
        else:
            items.append(
                CheckItem(
                    check="ZIP: лишние файлы",
                    status="ok",
                    description="Явно лишних исполняемых/скриптовых файлов внутри архива не обнаружено.",
                )
            )
    return items, inner_results


def analyze_document_authenticity(filename: str, content: bytes) -> DocumentAuthenticityResult:
    if len(content) > MAX_INPUT_BYTES:
        return DocumentAuthenticityResult(
            file_name=filename,
            format=_detect_format(filename, content),
            checks=[
                CheckItem(
                    check="Ограничение размера",
                    status="risk",
                    description=f"Файл слишком большой для безопасного анализа в текущем режиме (>{MAX_INPUT_BYTES} байт).",
                )
            ],
            risk_level="High",
            summary="Файл превышает безопасные ограничения анализа. Нужна ручная обработка или анализ в отдельной защищённой среде.",
            recommendation="Сократите размер, предоставьте исходник по частям или выполните анализ в выделенной среде с повышенными лимитами.",
        )

    checks, meta, has_structural_risk = _generic_checks(filename, content)
    fmt = _detect_format(filename, content)

    # Format-specific
    if fmt == "PDF":
        checks.extend(_pdf_specific_checks(content, meta))
    elif fmt == "DOCX":
        checks.extend(_ooxml_docx_checks(content, meta))
    elif fmt == "XLSX":
        checks.extend(_ooxml_xlsx_checks(content, meta))
    elif fmt == "PPTX":
        checks.extend(_ooxml_pptx_checks(content, meta))
    elif fmt in {"ODT", "ODS", "ODP"}:
        checks.extend(_odf_checks(content, meta))
    elif fmt in {"JPG", "PNG", "TIFF", "HEIC"}:
        checks.extend(_image_checks(fmt, content, meta))
    elif fmt == "XML":
        checks.extend(_xml_checks(content, meta))
    elif fmt == "CSV":
        checks.extend(_csv_checks(content))
    elif fmt == "ZIP":
        zip_items, inner = _zip_checks(filename, content)
        checks.extend(zip_items)
        # Summarize inner results into overall risk
        if inner:
            worst = "Low"
            order = {"Low": 0, "Medium": 1, "High": 2}
            for r in inner:
                if order[r.risk_level] > order[worst]:
                    worst = r.risk_level
            checks.append(
                CheckItem(
                    check="ZIP: результаты по файлам внутри",
                    status="warning" if worst != "Low" else "ok",
                    description=f"В архиве проанализировано файлов: {len(inner)}. Наибольший уровень риска среди вложений: {worst}.",
                )
            )
        # For container result, we keep format=ZIP and build summary from checks.
    else:
        # Legacy OLE formats get limited support
        if fmt in {"DOC", "XLS", "PPT", "OLE"}:
            checks.append(
                CheckItem(
                    check="Формат старого типа (OLE)",
                    status="warning",
                    description="Формат старого типа (DOC/XLS/PPT). Часть проверок доступна ограниченно; для углубленной проверки рекомендуется конвертация/получение исходника из первоисточника.",
                )
            )

    # Aggregate risk
    points = sum(_status_points(c.status) for c in checks)
    risk = _risk_from_points(points, has_structural_risk)
    summary, reco = _render_summary_and_reco(risk, checks)

    # Optional AI overlay: AI объясняет на основе технических проверок (только summary, один абзац)
    ai = _ai_overlay_if_available(filename, fmt, checks, risk, summary, reco)
    if ai:
        # AI возвращает только summary (один абзац, без воды)
        summary = ai.get("summary", summary)  # type: ignore
        # risk_level и recommendation остаются из технической проверки (AI не переопределяет)

    return DocumentAuthenticityResult(
        file_name=filename,
        format=fmt,
        checks=checks,
        risk_level=risk,
        summary=summary,
        recommendation=reco,
    )


def _ai_overlay_if_available(
    filename: str,
    fmt: str,
    checks: List[CheckItem],
    risk_level: RiskLevel,
    summary: str,
    recommendation: str,
) -> Optional[Dict[str, Any]]:
    """
    AI объясняет на основе технических проверок через Gemini API.
    Must NOT use "поддельный". Only "признаки".
    """
    import os
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        logger.debug("[Document AI] GOOGLE_API_KEY not set, skipping AI explanation")
        return None

    try:
        from google import genai  # type: ignore
    except Exception as e:
        logger.warning(f"[Document AI] Google GenAI library not available: {e}")
        return None

    compact_checks = [{"check": c.check, "status": c.status, "description": c.description} for c in checks][:30]
    
    findings = {
        "scope": "document_authenticity_report",
        "file_name": filename,
        "format": fmt,
        "risk_level": risk_level,
        "checks": compact_checks,
    }

    prompt = (
        "Ты — аналитик по проверке подлинности документов (официальный, нейтральный стиль).\n"
        "ВАЖНО:\n"
        "- Ты НЕ анализируешь документ напрямую и НЕ добавляешь новые признаки.\n"
        "- Ты объясняешь ТОЛЬКО то, что уже присутствует в объекте findings (технические проверки).\n"
        "- Ты НЕ принимаешь решений и НЕ делаешь категоричных выводов.\n"
        "- Запрещены слова: «взлом», «атака», «уязвимость». Запрещено утверждать, что документ «поддельный/фальшивый».\n"
        "- Можно говорить только про «признаки», «несоответствия», «требует дополнительной проверки».\n\n"
        "Сформируй ответ строго JSON (без markdown) такого вида:\n"
        "{\n"
        '  "summary": "один абзац, официальный нейтральный стиль, без воды"\n'
        "}\n\n"
        "Входные данные findings:\n"
        + json.dumps(findings, ensure_ascii=False)
    )

    try:
        logger.info("[Document AI] Calling Gemini API for document authenticity explanation")
        client = genai.Client(api_key=api_key)
        model_name = os.getenv("GEMINI_DOCUMENT_MODEL", "gemini-2.5-flash")
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
        )
        raw_text = (response.text or "").strip()
        logger.info(f"[Document AI] Gemini response received ({len(raw_text)} chars)")
        
        # Extract JSON
        if "```json" in raw_text:
            raw_text = raw_text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```", 1)[1].split("```", 1)[0].strip()
        
        data = json.loads(raw_text)
        
        # Hard filter forbidden wording
        summary_ai = str(data.get("summary", "")).strip()
        if summary_ai:
            summary_ai = re.sub(r"\bподделк\w*\b", "признаки несоответствий", summary_ai, flags=re.IGNORECASE)
            summary_ai = re.sub(r"\bвзлом\w*\b|\bуязвим\w*\b|\bатака\w*\b", "нежелательные термины", summary_ai, flags=re.IGNORECASE)
            summary_ai = re.sub(r"\b(точно|гарантированно|однозначно)\b", "с высокой вероятностью", summary_ai, flags=re.IGNORECASE)
        
        if not summary_ai:
            return None
        
        logger.info("[Document AI] Successfully generated AI explanation for document")
        return {"summary": summary_ai}
    except Exception as e:
        logger.error(f"[Document AI] Gemini API error: {e}", exc_info=True)
        return None


def start_authenticity_job(filename: str, content: bytes) -> str:
    job_id = hashlib.sha256(f"{time.time_ns()}::{filename}".encode("utf-8")).hexdigest()[:16]
    st = JobStatus(
        job_id=job_id,
        status="queued",
        progress=0,
        current_step="В очереди",
    )
    with _JOBS_LOCK:
        _JOBS[job_id] = _JobRecord(status=st, created_at=time.time(), updated_at=time.time())

    _EXECUTOR.submit(_run_job, job_id, filename, content)
    return job_id


def get_job_status(job_id: str) -> Optional[JobStatus]:
    with _JOBS_LOCK:
        rec = _JOBS.get(job_id)
        return rec.status if rec else None


def _update_job(job_id: str, **kwargs: Any) -> None:
    with _JOBS_LOCK:
        rec = _JOBS.get(job_id)
        if not rec:
            return
        for k, v in kwargs.items():
            if hasattr(rec.status, k):
                setattr(rec.status, k, v)
        rec.updated_at = time.time()


def _run_job(job_id: str, filename: str, content: bytes) -> None:
    try:
        _update_job(job_id, status="running", progress=5, current_step="Подготовка файла")
        # small delay to let UI show progress
        time.sleep(0.1)

        _update_job(job_id, progress=20, current_step="Базовые проверки (структура, метаданные)")
        time.sleep(0.05)

        _update_job(job_id, progress=45, current_step="Формат-специфичные проверки")
        time.sleep(0.05)

        result = analyze_document_authenticity(filename, content)
        _update_job(job_id, progress=90, current_step="Формирование отчёта", result=result)
        time.sleep(0.05)

        _update_job(job_id, status="done", progress=100, current_step="Готово")
    except Exception as e:
        logger.exception("Authenticity job failed")
        _update_job(job_id, status="error", error=str(e), current_step="Ошибка", progress=100)


