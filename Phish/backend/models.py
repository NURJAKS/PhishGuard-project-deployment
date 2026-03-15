from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

# Association table for roles and permissions
role_permissions = Table(
    'role_permissions', Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id'), primary_key=True),
    Column('permission_id', Integer, ForeignKey('permissions.id'), primary_key=True)
)

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    users = relationship("User", back_populates="user_role")

class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"))
    sector = Column(String, default="Public", nullable=False) # Public, Business, Government
    status = Column(String, default="active", nullable=False) # active, pending, restricted
    is_verified = Column(Integer, default=0) # 0 for false, 1 for true
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=func.now())

    user_role = relationship("Role", back_populates="users")
    incidents = relationship("Incident", back_populates="owner")

class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)  # allow, warn, block
    score = Column(Float, nullable=False)    # confidence score 0-1
    reason = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=func.now(), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    owner = relationship("User", back_populates="incidents")
    
    def to_dict(self):
        return {
            "id": self.id,
            "url": self.url,
            "action": self.action,
            "score": self.score,
            "reason": self.reason,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }

class PaymentCheck(Base):
    __tablename__ = "payment_checks"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String, nullable=True, index=True)
    url = Column(String, nullable=True, index=True)
    domain = Column(String, nullable=True, index=True)
    safe = Column(Integer, nullable=False, default=0)  # 1 safe, 0 unsafe
    score = Column(Float, nullable=False, default=0.0)
    reasons = Column(Text, nullable=True)  # JSON string
    meta = Column(Text, nullable=True)     # JSON string
    html_hash = Column(String, nullable=True)
    timestamp = Column(DateTime, default=func.now(), nullable=False)


class InvoiceCheck(Base):
    __tablename__ = "invoice_checks"
    
    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(String, nullable=False, unique=True, index=True)
    filename = Column(String, nullable=True)
    doc_hash = Column(String, nullable=False, index=True)  # SHA256 hash
    status = Column(String, nullable=False, index=True)  # accepted, suspicious, rejected
    score = Column(Float, nullable=False)  # 0-100
    invoice_data = Column(Text, nullable=True)  # JSON string with invoice details
    checks = Column(Text, nullable=True)  # JSON string with check results
    reasons = Column(Text, nullable=True)  # JSON string with reasons
    recommendations = Column(Text, nullable=True)  # JSON string with recommendations
    user_id = Column(String, nullable=True, index=True)  # For future user tracking
    decision = Column(String, nullable=True)  # User decision: approved, rejected, pending
    comments = Column(Text, nullable=True)  # User comments
    timestamp = Column(DateTime, default=func.now(), nullable=False, index=True)
    
    def to_dict(self):
        import json
        return {
            "id": self.id,
            "analysis_id": self.analysis_id,
            "filename": self.filename,
            "doc_hash": self.doc_hash,
            "status": self.status,
            "score": self.score,
            "invoice_data": json.loads(self.invoice_data) if self.invoice_data else None,
            "checks": json.loads(self.checks) if self.checks else None,
            "reasons": json.loads(self.reasons) if self.reasons else None,
            "recommendations": json.loads(self.recommendations) if self.recommendations else None,
            "user_id": self.user_id,
            "decision": self.decision,
            "comments": self.comments,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }
