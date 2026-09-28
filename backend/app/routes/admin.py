from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_

from app.database import get_db
from app.models import (
    User, UserRole, LoanApplication, ApplicationStatus, StatusHistory,
    Assessment, Notification, Loan, Repayment, AuditLog
)
from app.schemas import (
    StaffVerificationData, ApplicationDecision, LoanApplicationOut,
    LoanApplicationListOut, AssessmentOut, DashboardStats, AuditLogOut,
    LoanOut, NotificationOut
)
from app.auth import require_admin, get_current_user
from app.ml_service import model_service, calculate_emi, calculate_dti, generate_repayment_schedule

router = APIRouter(prefix="/api/admin", tags=["admin"])


# --- Dashboard ---

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Database-derived statistics for admin dashboard."""
    total = db.query(func.count(LoanApplication.id)).scalar() or 0
    pending = db.query(func.count(LoanApplication.id)).filter(
        LoanApplication.status.in_([ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW])
    ).scalar() or 0
    approved = db.query(func.count(LoanApplication.id)).filter(
        LoanApplication.status == ApplicationStatus.APPROVED
    ).scalar() or 0
    rejected = db.query(func.count(LoanApplication.id)).filter(
        LoanApplication.status == ApplicationStatus.REJECTED
    ).scalar() or 0
    needs_info = db.query(func.count(LoanApplication.id)).filter(
        LoanApplication.status == ApplicationStatus.NEEDS_INFORMATION
    ).scalar() or 0
    drafts = db.query(func.count(LoanApplication.id)).filter(
        LoanApplication.status == ApplicationStatus.DRAFT
    ).scalar() or 0

    total_disbursed = db.query(func.coalesce(func.sum(Loan.principal_amount), 0)).scalar() or 0
    avg_loan = db.query(func.coalesce(func.avg(LoanApplication.loan_amount), 0)).filter(
        LoanApplication.loan_amount.isnot(None)
    ).scalar() or 0

    return DashboardStats(
        total_applications=total,
        pending_review=pending,
        approved=approved,
        rejected=rejected,
        needs_info=needs_info,
        drafts=drafts,
        total_disbursed=float(total_disbursed),
        avg_loan_amount=float(avg_loan),
    )


# --- Application listing / search ---

@router.get("/applications", response_model=list[LoanApplicationListOut])
def list_applications(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    purpose: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List applications with search/filter for admin review."""
    q = db.query(LoanApplication).join(User, LoanApplication.user_id == User.id)

    if status:
        try:
            st = ApplicationStatus(status)
            q = q.filter(LoanApplication.status == st)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    if purpose:
        q = q.filter(LoanApplication.loan_purpose == purpose)

    if search:
        q = q.filter(
            or_(
                User.full_name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
                LoanApplication.id.ilike(f"%{search}%"),
            )
        )

    apps = (
        q.order_by(LoanApplication.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    result = []
    for app in apps:
        d = {c.name: getattr(app, c.name) for c in app.__table__.columns}
        d["applicant_name"] = app.applicant.full_name if app.applicant else None
        result.append(d)
    return result


@router.get("/applications/{app_id}", response_model=LoanApplicationOut)
def get_application_admin(
    app_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get full application details for admin."""
    app = (
        db.query(LoanApplication)
        .options(
            joinedload(LoanApplication.applicant),
            joinedload(LoanApplication.documents),
            joinedload(LoanApplication.status_history).joinedload(StatusHistory.user),
        )
        .filter(LoanApplication.id == app_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    d = {c.name: getattr(app, c.name) for c in app.__table__.columns}
    d["applicant_name"] = app.applicant.full_name if app.applicant else None
    from app.schemas import DocumentOut
    d["documents"] = [DocumentOut.model_validate(doc) for doc in (app.documents or [])]
    d["status_history"] = []
    for sh in (app.status_history or []):
        sh_dict = {c.name: getattr(sh, c.name) for c in sh.__table__.columns}
        sh_dict["user_name"] = sh.user.full_name if sh.user else None
        d["status_history"].append(sh_dict)
    return d


# --- Staff verification ---

@router.put("/applications/{app_id}/verify", response_model=LoanApplicationOut)
def verify_application(
    app_id: str,
    data: StaffVerificationData,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Staff enters/verifies credit information and proposed loan terms.
    Server computes proposed EMI and DTI. Does not trust client-supplied derived values."""
    app = db.query(LoanApplication).filter(LoanApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if app.status not in (ApplicationStatus.SUBMITTED, ApplicationStatus.UNDER_REVIEW):
        raise HTTPException(status_code=400, detail="Application must be submitted or under review to verify")

    # Update staff-verified fields
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(app, field, value)

    # Transition to under_review if submitted
    if app.status == ApplicationStatus.SUBMITTED:
        old_status = app.status
        app.status = ApplicationStatus.UNDER_REVIEW
        history = StatusHistory(
            application_id=app.id, old_status=old_status,
            new_status=ApplicationStatus.UNDER_REVIEW, changed_by=admin.id,
            reason="Application taken for review",
        )
        db.add(history)

    # Server-side EMI calculation
    if app.loan_amount and app.loan_term and app.quoted_interest_rate is not None:
        app.proposed_monthly_emi = calculate_emi(app.loan_amount, app.quoted_interest_rate, app.loan_term)
    elif app.loan_amount and app.loan_term:
        # If no interest rate yet, leave EMI as None
        app.proposed_monthly_emi = None

    # Server-side DTI calculation
    combined_income = (app.applicant_income or 0) + (app.coapplicant_income or 0)
    if combined_income > 0 and app.proposed_monthly_emi is not None:
        app.dti_ratio = calculate_dti(
            app.existing_monthly_emi or 0,
            app.proposed_monthly_emi,
            combined_income,
        )

    audit = AuditLog(
        user_id=admin.id, action="application_verified",
        entity_type="application", entity_id=app.id,
        details=data.model_dump(exclude_unset=True),
    )
    db.add(audit)
    db.commit()

    return _load_full_app_admin(db, app_id)


# --- ML Assessment ---

@router.post("/applications/{app_id}/assess", response_model=AssessmentOut)
def run_assessment(
    app_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Run ML assessment on an application. Model outputs are advisory only.
    Delays assessment when necessary required information is unavailable."""
    app = db.query(LoanApplication).filter(LoanApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if app.status not in (ApplicationStatus.UNDER_REVIEW, ApplicationStatus.SUBMITTED):
        raise HTTPException(status_code=400, detail="Application must be under review")

    # Check required fields for assessment
    required_for_approval = [
        "applicant_income", "loan_amount", "loan_term",
        "existing_monthly_emi", "quoted_interest_rate", "proposed_monthly_emi",
    ]
    missing = [f for f in required_for_approval if getattr(app, f) is None]
    if missing:
        # Create assessment with unavailable status
        assessment = Assessment(
            application_id=app.id,
            input_snapshot=_build_input_snapshot(app),
            status="unavailable",
            error_message=f"Cannot assess: missing fields {', '.join(missing)}. Complete staff verification first.",
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
        return assessment

    # Build raw input dict
    raw = _build_raw_input(app)
    snapshot = _build_input_snapshot(app)

    # Run both models
    results = model_service.run_assessment(raw)
    approval = results["approval"]
    anomaly = results["anomaly"]

    # Determine overall status
    if approval["status"] == "error" and anomaly["status"] == "error":
        overall_status = "error"
    elif approval["status"] == "unavailable" and anomaly["status"] == "unavailable":
        overall_status = "unavailable"
    else:
        overall_status = "completed"

    error_msgs = []
    if approval.get("error"):
        error_msgs.append(f"Approval: {approval['error']}")
    if anomaly.get("error"):
        error_msgs.append(f"Anomaly: {anomaly['error']}")

    feature_values = {}
    if approval.get("feature_values"):
        feature_values["approval"] = approval["feature_values"]
    if anomaly.get("feature_values"):
        feature_values["anomaly"] = anomaly["feature_values"]

    assessment = Assessment(
        application_id=app.id,
        input_snapshot=snapshot,
        feature_values=feature_values,
        approval_prediction=approval.get("prediction"),
        approval_probability=approval.get("approval_probability"),
        approval_model_version=approval.get("model_version"),
        anomaly_score=anomaly.get("anomaly_score"),
        anomaly_threshold=anomaly.get("anomaly_threshold"),
        anomaly_flagged=anomaly.get("anomaly_flagged"),
        isolation_model_version=anomaly.get("model_version"),
        status=overall_status,
        error_message="; ".join(error_msgs) if error_msgs else None,
    )
    db.add(assessment)

    audit = AuditLog(
        user_id=admin.id, action="assessment_run",
        entity_type="assessment", entity_id=assessment.id,
        details={"approval_status": approval["status"], "anomaly_status": anomaly["status"]},
    )
    db.add(audit)
    db.commit()
    db.refresh(assessment)
    return assessment


@router.get("/applications/{app_id}/assessments", response_model=list[AssessmentOut])
def list_assessments(
    app_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all assessments for an application."""
    assessments = (
        db.query(Assessment)
        .filter(Assessment.application_id == app_id)
        .order_by(Assessment.created_at.desc())
        .all()
    )
    return assessments


# --- Decision ---

@router.post("/applications/{app_id}/decide", response_model=LoanApplicationOut)
def decide_application(
    app_id: str,
    data: ApplicationDecision,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Approve, reject, or request clarification. Mandatory reason required."""
    app = db.query(LoanApplication).filter(LoanApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if app.status not in (ApplicationStatus.UNDER_REVIEW, ApplicationStatus.SUBMITTED):
        raise HTTPException(status_code=400, detail="Application must be under review to decide")

    old_status = app.status
    now = datetime.now(timezone.utc)

    if data.decision == "approved":
        app.status = ApplicationStatus.APPROVED
        app.decision_reason = data.reason
        app.decided_by = admin.id
        app.decided_at = now

        # Create loan record
        if app.loan_amount and app.quoted_interest_rate is not None and app.loan_term and app.proposed_monthly_emi:
            loan = Loan(
                application_id=app.id,
                principal_amount=app.loan_amount,
                interest_rate=app.quoted_interest_rate,
                term_months=app.loan_term,
                monthly_emi=app.proposed_monthly_emi,
                total_payable=round(app.proposed_monthly_emi * app.loan_term, 2),
                is_simulated=True,
            )
            db.add(loan)
            db.flush()

            # Generate repayment schedule
            schedule = generate_repayment_schedule(
                app.loan_amount, app.quoted_interest_rate, app.loan_term, now,
            )
            for entry in schedule:
                rep = Repayment(
                    loan_id=loan.id,
                    is_simulated=True,
                    **entry,
                )
                db.add(rep)

        # Notify customer
        notif = Notification(
            user_id=app.user_id, application_id=app.id,
            title="Loan Approved",
            message=f"Your loan application has been approved. Reason: {data.reason}",
        )
        db.add(notif)

    elif data.decision == "rejected":
        app.status = ApplicationStatus.REJECTED
        app.decision_reason = data.reason
        app.decided_by = admin.id
        app.decided_at = now

        notif = Notification(
            user_id=app.user_id, application_id=app.id,
            title="Loan Application Rejected",
            message=f"Your loan application has been rejected. Reason: {data.reason}",
        )
        db.add(notif)

    elif data.decision == "needs_information":
        app.status = ApplicationStatus.NEEDS_INFORMATION

        notif = Notification(
            user_id=app.user_id, application_id=app.id,
            title="Additional Information Required",
            message=f"Your loan application requires additional information: {data.reason}",
        )
        db.add(notif)

    history = StatusHistory(
        application_id=app.id, old_status=old_status,
        new_status=app.status, changed_by=admin.id,
        reason=data.reason,
    )
    db.add(history)

    audit = AuditLog(
        user_id=admin.id, action=f"application_{data.decision}",
        entity_type="application", entity_id=app.id,
        details={"reason": data.reason},
    )
    db.add(audit)
    db.commit()

    return _load_full_app_admin(db, app_id)


# --- Loan details ---

@router.get("/applications/{app_id}/loan", response_model=LoanOut)
def get_loan_details_admin(
    app_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    loan = (
        db.query(Loan)
        .options(joinedload(Loan.repayments))
        .filter(Loan.application_id == app_id)
        .first()
    )
    if not loan:
        raise HTTPException(status_code=404, detail="No loan found for this application")
    return loan


# --- Audit logs ---

@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog).outerjoin(User, AuditLog.user_id == User.id)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)

    logs = (
        q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    result = []
    for log in logs:
        d = {c.name: getattr(log, c.name) for c in log.__table__.columns}
        d["user_name"] = log.user.full_name if log.user else None
        result.append(d)
    return result


# --- Helpers ---

def _build_raw_input(app: LoanApplication) -> dict:
    """Build the raw input dict expected by ML models."""
    return {
        "Applicant_Income": app.applicant_income,
        "Coapplicant_Income": app.coapplicant_income,
        "Employment_Status": app.employment_status,
        "Age": app.age,
        "Marital_Status": app.marital_status,
        "Dependents": app.dependents,
        "Credit_Score": app.credit_score,
        "Existing_Loans": app.existing_loans,
        "DTI_Ratio": app.dti_ratio,
        "Savings": app.savings,
        "Collateral_Value": app.collateral_value,
        "Loan_Amount": app.loan_amount,
        "Loan_Term": app.loan_term,
        "Loan_Purpose": app.loan_purpose,
        "Property_Area": app.property_area,
        "Education_Level": app.education_level,
        "Gender": app.gender,
        "Employer_Category": app.employer_category,
        "Employment_Years": app.employment_years,
        "Credit_History_Years": app.credit_history_years,
        "Late_Payments_12M": app.late_payments_12m,
        "Existing_Monthly_EMI": app.existing_monthly_emi,
        "Quoted_Interest_Rate": app.quoted_interest_rate,
        "Proposed_Monthly_EMI": app.proposed_monthly_emi,
    }


def _build_input_snapshot(app: LoanApplication) -> dict:
    """Full snapshot of application state at assessment time."""
    return _build_raw_input(app)


def _load_full_app_admin(db: Session, app_id: str) -> dict:
    from app.routes.applications import _load_full_app
    return _load_full_app(db, app_id)
