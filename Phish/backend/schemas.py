from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    sector: str = "Public"

class UserCreate(UserBase):
    password: str
    role_id: Optional[int] = None

class UserResponse(UserBase):
    id: int
    role_id: Optional[int]
    status: str
    is_verified: int
    created_at: datetime
    role_name: Optional[str] = None # Added via computation or relationship

    class Config:
        from_attributes = True

class UserRoleUpdate(BaseModel):
    role_id: int

class PermissionResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]

    class Config:
        from_attributes = True

class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: List[PermissionResponse] = []

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class TokenData(BaseModel):
    username: Optional[str] = None

class URLRequest(BaseModel):
    url: str

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






