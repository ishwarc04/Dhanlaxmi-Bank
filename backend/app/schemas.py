from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from app.models import UserRole, ApplicationStatus


# --- Auth ---
class UserRegister(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=20)


# --- Loan Application ---
class LoanApplicationCreate(BaseModel):
    """Fields a customer can provide when creating/updating a draft."""
    applicant_income: Optional[float] = Field(None, ge=0, description="Monthly income in INR")
    coapplicant_income: Optional[float] = Field(None, ge=0, description="Co-applicant monthly income in INR")
    employment_status: Optional[str] = None
    age: Optional[int] = Field(None, ge=18, le=100)
    marital_status: Optional[str] = None
    dependents: Optional[float] = Field(None, ge=0)
    savings: Optional[float] = Field(None, ge=0, description="Savings balance in INR")
    loan_amount: Optional[float] = Field(None, gt=0, description="Loan principal in INR")
    loan_term: Optional[int] = Field(None, gt=0, description="Loan term in months")
    loan_purpose: Optional[str] = None
    property_area: Optional[str] = None
    education_level: Optional[str] = None
    gender: Optional[str] = None
    employer_category: Optional[str] = None


class StaffVerificationData(BaseModel):
    """Fields a staff member verifies/enters."""
    credit_score: Optional[float] = Field(None, ge=300, le=900)
    credit_history_years: Optional[float] = Field(None, ge=0)
    late_payments_12m: Optional[int] = Field(None, ge=0)
    existing_loans: Optional[int] = Field(None, ge=0)
    existing_monthly_emi: Optional[float] = Field(None, ge=0, description="Existing EMI in INR/month")
    employment_years: Optional[float] = Field(None, ge=0)
    collateral_value: Optional[float] = Field(None, ge=0, description="Collateral value in INR")
    quoted_interest_rate: Optional[float] = Field(None, ge=0, le=50, description="Annual interest rate %")


class ApplicationDecision(BaseModel):
    decision: str = Field(..., pattern="^(approved|rejected|needs_information)$")
    reason: str = Field(..., min_length=1, max_length=2000)


class ClarificationResponse(BaseModel):
    """Customer responds to clarification request."""
    message: str = Field(..., min_length=1, max_length=2000)


# --- Outputs ---
class DocumentOut(BaseModel):
    id: str
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    category: Optional[str] = None
    uploaded_at: datetime

    class Config:
        from_attributes = True


class StatusHistoryOut(BaseModel):
    id: str
    old_status: Optional[ApplicationStatus] = None
    new_status: ApplicationStatus
    changed_by: str
    reason: Optional[str] = None
    created_at: datetime
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class AssessmentOut(BaseModel):
    id: str
    approval_prediction: Optional[int] = None
    approval_probability: Optional[float] = None
    approval_model_version: Optional[str] = None
    anomaly_score: Optional[float] = None
    anomaly_threshold: Optional[float] = None
    anomaly_flagged: Optional[bool] = None
    isolation_model_version: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: str
    application_id: Optional[str] = None
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RepaymentOut(BaseModel):
    id: str
    installment_number: int
    due_date: datetime
    principal_component: float
    interest_component: float
    emi_amount: float
    outstanding_balance: float
    is_paid: bool
    paid_at: Optional[datetime] = None
    is_simulated: bool

    class Config:
        from_attributes = True


class LoanOut(BaseModel):
    id: str
    application_id: str
    principal_amount: float
    interest_rate: float
    term_months: int
    monthly_emi: float
    total_payable: float
    disbursed_at: datetime
    is_simulated: bool
    repayments: List[RepaymentOut] = []

    class Config:
        from_attributes = True


class LoanApplicationOut(BaseModel):
    id: str
    user_id: str
    status: ApplicationStatus

    applicant_income: Optional[float] = None
    coapplicant_income: Optional[float] = None
    employment_status: Optional[str] = None
    age: Optional[int] = None
    marital_status: Optional[str] = None
    dependents: Optional[float] = None
    savings: Optional[float] = None
    loan_amount: Optional[float] = None
    loan_term: Optional[int] = None
    loan_purpose: Optional[str] = None
    property_area: Optional[str] = None
    education_level: Optional[str] = None
    gender: Optional[str] = None
    employer_category: Optional[str] = None

    credit_score: Optional[float] = None
    credit_history_years: Optional[float] = None
    late_payments_12m: Optional[int] = None
    existing_loans: Optional[int] = None
    existing_monthly_emi: Optional[float] = None
    employment_years: Optional[float] = None
    collateral_value: Optional[float] = None
    quoted_interest_rate: Optional[float] = None

    proposed_monthly_emi: Optional[float] = None
    dti_ratio: Optional[float] = None

    decision_reason: Optional[str] = None
    decided_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    applicant_name: Optional[str] = None
    documents: List[DocumentOut] = []
    status_history: List[StatusHistoryOut] = []

    class Config:
        from_attributes = True


class CustomerLoanApplicationOut(BaseModel):
    """
    Application view returned to the applicant (customer).
    Staff-internal fields (credit_score, DTI, internal rate details) are excluded
    to prevent unintentional information disclosure.
    """
    id: str
    user_id: str
    status: ApplicationStatus

    applicant_income: Optional[float] = None
    coapplicant_income: Optional[float] = None
    employment_status: Optional[str] = None
    age: Optional[int] = None
    marital_status: Optional[str] = None
    dependents: Optional[float] = None
    savings: Optional[float] = None
    loan_amount: Optional[float] = None
    loan_term: Optional[int] = None
    loan_purpose: Optional[str] = None
    property_area: Optional[str] = None
    education_level: Optional[str] = None
    gender: Optional[str] = None
    employer_category: Optional[str] = None

    # Computed values customers need to plan repayments
    proposed_monthly_emi: Optional[float] = None
    dti_ratio: Optional[float] = None

    # Decision information visible to customer
    decision_reason: Optional[str] = None
    decided_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    applicant_name: Optional[str] = None
    documents: List[DocumentOut] = []
    status_history: List[StatusHistoryOut] = []

    class Config:
        from_attributes = True


class LoanApplicationListOut(BaseModel):
    id: str
    user_id: str
    status: ApplicationStatus
    loan_amount: Optional[float] = None
    loan_purpose: Optional[str] = None
    applicant_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime
    user_name: Optional[str] = None

    class Config:
        from_attributes = True


class EMICalculatorRequest(BaseModel):
    principal: float = Field(..., gt=0, description="Loan amount in INR")
    annual_rate: float = Field(..., ge=0, le=50, description="Annual interest rate %")
    term_months: int = Field(..., gt=0, le=600, description="Loan term in months")


class EMICalculatorResponse(BaseModel):
    monthly_emi: float
    total_payment: float
    total_interest: float
    principal: float
    annual_rate: float
    term_months: int


class DashboardStats(BaseModel):
    total_applications: int
    pending_review: int
    approved: int
    rejected: int
    needs_info: int
    drafts: int
    total_disbursed: float
    avg_loan_amount: float
