import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.database import get_db
from app.models import (
    User, UserRole, LoanApplication, ApplicationStatus, Document,
    StatusHistory, Notification, AuditLog
)
from app.schemas import (
    LoanApplicationCreate, LoanApplicationOut, CustomerLoanApplicationOut,
    LoanApplicationListOut, ClarificationResponse, DocumentOut
)
from app.auth import get_current_user, require_customer
from app.config import settings

router = APIRouter(prefix="/api/applications", tags=["applications"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

VALID_CATEGORIES = {
    "Employment_Status": ["Contract", "Salaried", "Self-employed", "Unemployed"],
    "Marital_Status": ["Married", "Single"],
    "Loan_Purpose": ["Business", "Car", "Education", "Home", "Personal"],
    "Property_Area": ["Rural", "Semiurban", "Urban"],
    "Education_Level": ["Graduate", "Not Graduate"],
    "Gender": ["Female", "Male"],
    "Employer_Category": ["Business", "Government", "MNC", "Private", "Unemployed"],
}


def _validate_categories(data: LoanApplicationCreate):
    """Validate categorical fields against metadata-defined categories."""
    field_map = {
        "employment_status": "Employment_Status",
        "marital_status": "Marital_Status",
        "loan_purpose": "Loan_Purpose",
        "property_area": "Property_Area",
        "education_level": "Education_Level",
        "gender": "Gender",
        "employer_category": "Employer_Category",
    }
    errors = []
    for field, cat_key in field_map.items():
        val = getattr(data, field, None)
        if val is not None and val not in VALID_CATEGORIES[cat_key]:
            errors.append(f"{field}: '{val}' not in {VALID_CATEGORIES[cat_key]}")
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))


def _enrich_app(app: LoanApplication) -> dict:
    """Convert application model to dict with applicant name."""
    d = {c.name: getattr(app, c.name) for c in app.__table__.columns}
    d["applicant_name"] = app.applicant.full_name if app.applicant else None
    d["documents"] = [
        DocumentOut.model_validate(doc) for doc in (app.documents or [])
    ]
    d["status_history"] = []
    for sh in (app.status_history or []):
        sh_dict = {c.name: getattr(sh, c.name) for c in sh.__table__.columns}
        sh_dict["user_name"] = sh.user.full_name if sh.user else None
        d["status_history"].append(sh_dict)
    return d


# --- Customer endpoints ---

@router.post("/", response_model=CustomerLoanApplicationOut, status_code=201)
def create_application(
    data: LoanApplicationCreate,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Create a new draft application."""
    _validate_categories(data)

    app = LoanApplication(
        user_id=current_user.id,
        status=ApplicationStatus.DRAFT,
        **data.model_dump(exclude_none=True),
    )
    db.add(app)
    db.flush()

    history = StatusHistory(
        application_id=app.id, old_status=None,
        new_status=ApplicationStatus.DRAFT, changed_by=current_user.id,
    )
    db.add(history)

    audit = AuditLog(
        user_id=current_user.id, action="application_created",
        entity_type="application", entity_id=app.id,
    )
    db.add(audit)
    db.commit()

    return _load_full_app(db, app.id)


@router.put("/{app_id}", response_model=CustomerLoanApplicationOut)
def update_draft(
    app_id: str,
    data: LoanApplicationCreate,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Update a draft application (save draft)."""
    app = _get_app_for_customer(db, app_id, current_user.id)
    if app.status != ApplicationStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Can only edit draft applications")

    _validate_categories(data)

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(app, field, value)

    audit = AuditLog(
        user_id=current_user.id, action="draft_updated",
        entity_type="application", entity_id=app.id,
    )
    db.add(audit)
    db.commit()

    return _load_full_app(db, app.id)


@router.post("/{app_id}/submit", response_model=CustomerLoanApplicationOut)
def submit_application(
    app_id: str,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Submit a draft application."""
    app = _get_app_for_customer(db, app_id, current_user.id)
    if app.status not in (ApplicationStatus.DRAFT, ApplicationStatus.NEEDS_INFORMATION):
        raise HTTPException(status_code=400, detail="Can only submit drafts or resubmit after clarification")

    # Validate minimum required fields
    required = ["applicant_income", "loan_amount", "loan_term", "loan_purpose"]
    missing = [f for f in required if getattr(app, f) is None]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required fields: {', '.join(missing)}")

    old_status = app.status
    app.status = ApplicationStatus.SUBMITTED

    history = StatusHistory(
        application_id=app.id, old_status=old_status,
        new_status=ApplicationStatus.SUBMITTED, changed_by=current_user.id,
    )
    db.add(history)

    audit = AuditLog(
        user_id=current_user.id, action="application_submitted",
        entity_type="application", entity_id=app.id,
    )
    db.add(audit)
    db.commit()

    return _load_full_app(db, app.id)


@router.post("/{app_id}/clarification", response_model=CustomerLoanApplicationOut)
def respond_to_clarification(
    app_id: str,
    data: ClarificationResponse,
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Customer responds to a clarification request and resubmits."""
    app = _get_app_for_customer(db, app_id, current_user.id)
    if app.status != ApplicationStatus.NEEDS_INFORMATION:
        raise HTTPException(status_code=400, detail="Application is not awaiting clarification")

    old_status = app.status
    app.status = ApplicationStatus.SUBMITTED

    history = StatusHistory(
        application_id=app.id, old_status=old_status,
        new_status=ApplicationStatus.SUBMITTED, changed_by=current_user.id,
        reason=f"Clarification response: {data.message}",
    )
    db.add(history)

    notif = Notification(
        user_id=current_user.id, application_id=app.id,
        title="Clarification Submitted",
        message="Your clarification response has been submitted. The application is back under review.",
    )
    db.add(notif)

    audit = AuditLog(
        user_id=current_user.id, action="clarification_responded",
        entity_type="application", entity_id=app.id,
        details={"message": data.message},
    )
    db.add(audit)
    db.commit()

    return _load_full_app(db, app.id)


@router.get("/my", response_model=list[LoanApplicationListOut])
def list_my_applications(
    current_user: User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """List current customer's applications."""
    apps = (
        db.query(LoanApplication)
        .filter(LoanApplication.user_id == current_user.id)
        .order_by(LoanApplication.updated_at.desc())
        .all()
    )
    result = []
    for app in apps:
        d = {c.name: getattr(app, c.name) for c in app.__table__.columns}
        d["applicant_name"] = current_user.full_name
        result.append(d)
    return result


@router.get("/{app_id}", response_model=CustomerLoanApplicationOut)
def get_application(
    app_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get application details. Customers can only see own, admins can see all."""
    if current_user.role == UserRole.CUSTOMER:
        app = _get_app_for_customer(db, app_id, current_user.id)
    elif current_user.role == UserRole.ADMIN:
        # NOTE: /applications/my is registered before /{app_id}; do not reorder these routes.
        app = _load_full_app_model(db, app_id)
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
    else:
        # Explicit 403 for any unexpected future role rather than silently leaking data
        raise HTTPException(status_code=403, detail="Access denied")

    return _enrich_app(app)


# --- Document uploads ---

@router.post("/{app_id}/documents", response_model=DocumentOut)
async def upload_document(
    app_id: str,
    file: UploadFile = File(...),
    category: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a document to an application."""
    # Ownership/role check
    app = _load_full_app_model(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role == UserRole.CUSTOMER and app.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail=f"File type not allowed: {file.content_type}")

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)")

    # Save file
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    stored_name = f"{uuid.uuid4()}{ext}"
    app_dir = os.path.join(settings.UPLOADS_DIR, app_id)
    os.makedirs(app_dir, exist_ok=True)
    filepath = os.path.join(app_dir, stored_name)
    with open(filepath, "wb") as f:
        f.write(content)

    doc = Document(
        application_id=app_id,
        filename=stored_name,
        original_filename=file.filename or "unknown",
        content_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        category=category,
    )
    db.add(doc)

    audit = AuditLog(
        user_id=current_user.id, action="document_uploaded",
        entity_type="document", entity_id=doc.id,
        details={"application_id": app_id, "filename": file.filename, "category": category},
    )
    db.add(audit)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{app_id}/documents/{doc_id}/download")
def download_document(
    app_id: str,
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download a document. Ownership/role checked."""
    app = _load_full_app_model(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role == UserRole.CUSTOMER and app.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    doc = db.query(Document).filter(Document.id == doc_id, Document.application_id == app_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    filepath = os.path.join(settings.UPLOADS_DIR, app_id, doc.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        filepath,
        media_type=doc.content_type,
        filename=doc.original_filename,
    )


# --- Helpers ---

def _get_app_for_customer(db: Session, app_id: str, user_id: str) -> LoanApplication:
    app = _load_full_app_model(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return app


def _load_full_app_model(db: Session, app_id: str) -> Optional[LoanApplication]:
    return (
        db.query(LoanApplication)
        .options(
            joinedload(LoanApplication.applicant),
            joinedload(LoanApplication.documents),
            joinedload(LoanApplication.status_history).joinedload(StatusHistory.user),
        )
        .filter(LoanApplication.id == app_id)
        .first()
    )


def _load_full_app(db: Session, app_id: str) -> dict:
    app = _load_full_app_model(db, app_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _enrich_app(app)
