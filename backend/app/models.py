import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, Enum as SAEnum, JSON, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    ADMIN = "admin"


class ApplicationStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    NEEDS_INFORMATION = "needs_information"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.CUSTOMER)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    applications = relationship("LoanApplication", back_populates="applicant", foreign_keys="LoanApplication.user_id")
    notifications = relationship("Notification", back_populates="user")


class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(SAEnum(ApplicationStatus), nullable=False, default=ApplicationStatus.DRAFT)

    # Customer-provided fields
    applicant_income = Column(Float, nullable=True)
    coapplicant_income = Column(Float, nullable=True)
    employment_status = Column(String(50), nullable=True)
    age = Column(Integer, nullable=True)
    marital_status = Column(String(20), nullable=True)
    dependents = Column(Float, nullable=True)
    savings = Column(Float, nullable=True)
    loan_amount = Column(Float, nullable=True)
    loan_term = Column(Integer, nullable=True)  # months
    loan_purpose = Column(String(50), nullable=True)
    property_area = Column(String(50), nullable=True)
    education_level = Column(String(50), nullable=True)
    gender = Column(String(20), nullable=True)
    employer_category = Column(String(50), nullable=True)

    # Staff-verified fields (entered by admin/officer)
    credit_score = Column(Float, nullable=True)
    credit_history_years = Column(Float, nullable=True)
    late_payments_12m = Column(Integer, nullable=True)
    existing_loans = Column(Integer, nullable=True)
    existing_monthly_emi = Column(Float, nullable=True)
    employment_years = Column(Float, nullable=True)
    collateral_value = Column(Float, nullable=True)
    quoted_interest_rate = Column(Float, nullable=True)  # annual %

    # Computed server-side
    proposed_monthly_emi = Column(Float, nullable=True)
    dti_ratio = Column(Float, nullable=True)

    # Decision
    decision_reason = Column(Text, nullable=True)
    decided_by = Column(String, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    applicant = relationship("User", back_populates="applications", foreign_keys=[user_id])
    decider = relationship("User", foreign_keys=[decided_by])
    documents = relationship("Document", back_populates="application", cascade="all, delete-orphan")
    status_history = relationship("StatusHistory", back_populates="application", cascade="all, delete-orphan", order_by="StatusHistory.created_at")
    assessments = relationship("Assessment", back_populates="application", cascade="all, delete-orphan", order_by="Assessment.created_at.desc()")
    notifications = relationship("Notification", back_populates="application", cascade="all, delete-orphan")
    loan = relationship("Loan", back_populates="application", uselist=False)

    __table_args__ = (
        Index("idx_app_status", "status"),
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=new_uuid)
    application_id = Column(String, ForeignKey("loan_applications.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    category = Column(String(100), nullable=True)  # e.g. "identity", "income_proof", "collateral"
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)

    application = relationship("LoanApplication", back_populates="documents")


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(String, primary_key=True, default=new_uuid)
    application_id = Column(String, ForeignKey("loan_applications.id"), nullable=False, index=True)
    old_status = Column(SAEnum(ApplicationStatus), nullable=True)
    new_status = Column(SAEnum(ApplicationStatus), nullable=False)
    changed_by = Column(String, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    application = relationship("LoanApplication", back_populates="status_history")
    user = relationship("User")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, default=new_uuid)
    application_id = Column(String, ForeignKey("loan_applications.id"), nullable=False, index=True)

    # Input snapshot
    input_snapshot = Column(JSON, nullable=False)
    feature_values = Column(JSON, nullable=True)

    # Approval model outputs
    approval_prediction = Column(Integer, nullable=True)  # 0 or 1
    approval_probability = Column(Float, nullable=True)
    approval_model_version = Column(String(50), nullable=True)

    # Isolation model outputs
    anomaly_score = Column(Float, nullable=True)
    anomaly_threshold = Column(Float, nullable=True)
    anomaly_flagged = Column(Boolean, nullable=True)
    isolation_model_version = Column(String(50), nullable=True)

    # Status
    status = Column(String(50), nullable=False, default="completed")  # completed, error, unavailable
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow)

    application = relationship("LoanApplication", back_populates="assessments")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    application_id = Column(String, ForeignKey("loan_applications.id"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="notifications")
    application = relationship("LoanApplication", back_populates="notifications")


class Loan(Base):
    __tablename__ = "loans"

    id = Column(String, primary_key=True, default=new_uuid)
    application_id = Column(String, ForeignKey("loan_applications.id"), nullable=False, unique=True)
    principal_amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)  # annual %
    term_months = Column(Integer, nullable=False)
    monthly_emi = Column(Float, nullable=False)
    total_payable = Column(Float, nullable=False)
    disbursed_at = Column(DateTime(timezone=True), default=utcnow)
    is_simulated = Column(Boolean, default=True)

    application = relationship("LoanApplication", back_populates="loan")
    repayments = relationship("Repayment", back_populates="loan", cascade="all, delete-orphan", order_by="Repayment.due_date")


class Repayment(Base):
    __tablename__ = "repayments"

    id = Column(String, primary_key=True, default=new_uuid)
    loan_id = Column(String, ForeignKey("loans.id"), nullable=False, index=True)
    installment_number = Column(Integer, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=False)
    principal_component = Column(Float, nullable=False)
    interest_component = Column(Float, nullable=False)
    emi_amount = Column(Float, nullable=False)
    outstanding_balance = Column(Float, nullable=False)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    is_simulated = Column(Boolean, default=True)

    loan = relationship("Loan", back_populates="repayments")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User")

    __table_args__ = (
        Index("idx_audit_entity", "entity_type", "entity_id"),
    )
