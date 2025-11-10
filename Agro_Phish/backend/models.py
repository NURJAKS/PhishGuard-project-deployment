from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()

class Incident(Base):
    __tablename__ = "incidents"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False, index=True)
    action = Column(String, nullable=False)  # allow, warn, block
    score = Column(Float, nullable=False)    # confidence score 0-1
    reason = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=func.now(), nullable=False)
    
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
