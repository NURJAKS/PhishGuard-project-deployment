from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class PaymentAnalysisRequest(BaseModel):
    request_id: Optional[str] = None
    url: Optional[str] = None
    html_snippet: str = Field(default="", max_length=30000)
    html_hash: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class PaymentAnalysisResponse(BaseModel):
    request_id: Optional[str] = None
    safe: bool
    score: float
    reasons: List[str]
    explain: Dict[str, Any]






