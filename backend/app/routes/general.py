from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import User, UserRole, Notification, Loan, LoanApplication
from app.schemas import NotificationOut, LoanOut, EMICalculatorRequest, EMICalculatorResponse
from app.auth import get_current_user, require_customer
from app.ml_service import calculate_emi

router = APIRouter(prefix="/api", tags=["general"])


# --- Notifications ---

@router.get("/notifications", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    return q.order_by(Notification.created_at.desc()).limit(50).all()


@router.put("/notifications/{notif_id}/read")
def mark_notification_read(
    notif_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"status": "ok"}


@router.put("/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}


# --- EMI Calculator ---

@router.post("/emi-calculator", response_model=EMICalculatorResponse)
def emi_calculator(data: EMICalculatorRequest):
    """Public EMI calculator."""
    emi = calculate_emi(data.principal, data.annual_rate, data.term_months)
    total = round(emi * data.term_months, 2)
    return EMICalculatorResponse(
        monthly_emi=emi,
        total_payment=total,
        total_interest=round(total - data.principal, 2),
        principal=data.principal,
        annual_rate=data.annual_rate,
        term_months=data.term_months,
    )


# --- Customer loan details ---

@router.get("/loans/{app_id}", response_model=LoanOut)
def get_loan_details(
    app_id: str,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Customer views approved loan details and repayment schedule."""
    app = db.query(LoanApplication).filter(LoanApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    loan = (
        db.query(Loan)
        .options(joinedload(Loan.repayments))
        .filter(Loan.application_id == app_id)
        .first()
    )
    if not loan:
        raise HTTPException(status_code=404, detail="No loan found for this application")
    return loan


# --- Simulated Payment ---

@router.post("/loans/{app_id}/repayments/{repayment_id}/pay")
def simulate_payment(
    app_id: str,
    repayment_id: str,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Simulate a payment. Clearly labeled as simulated."""
    app = db.query(LoanApplication).filter(LoanApplication.id == app_id).first()
    if not app or app.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.models import Repayment
    rep = db.query(Repayment).join(Loan).filter(
        Repayment.id == repayment_id,
        Loan.application_id == app_id,
    ).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Repayment not found")
    if rep.is_paid:
        raise HTTPException(status_code=400, detail="Already paid")

    from datetime import datetime, timezone
    rep.is_paid = True
    rep.paid_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "message": "Simulated payment recorded", "is_simulated": True}


# --- Model Status ---

@router.get("/model-status")
def model_status(current_user: User = Depends(require_admin)):
    """Check ML model availability — admin only (exposes internal infrastructure state)."""
    from app.ml_service import model_service
    return {
        "approval_available": model_service.approval_available,
        "isolation_available": model_service.isolation_available,
        "load_errors": model_service.load_errors,
    }
