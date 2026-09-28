"""Static schema verification — no live DB required."""
import sys
sys.path.insert(0, '')

from app.database import Base
from app.models import User, LoanApplication, Document, StatusHistory  # noqa
from app.models import Assessment, Notification, Loan, Repayment, AuditLog  # noqa

checks = []

# 1. All 9 tables exist
expected_tables = [
    'users', 'loan_applications', 'documents', 'status_history',
    'assessments', 'notifications', 'loans', 'repayments', 'audit_logs',
]
for t in expected_tables:
    checks.append((f'table:{t}', t in Base.metadata.tables))

# 2. LoanApplication relationships
app_rels = {r.key for r in LoanApplication.__mapper__.relationships}
for rel in ['applicant', 'documents', 'status_history', 'assessments', 'loan', 'notifications']:
    checks.append((f'LoanApplication.{rel}', rel in app_rels))

# 3. Loan.repayments
loan_rels = {r.key for r in Loan.__mapper__.relationships}
checks.append(('Loan.repayments', 'repayments' in loan_rels))

# 4. User relationships
user_rels = {r.key for r in User.__mapper__.relationships}
checks.append(('User.applications', 'applications' in user_rels))
checks.append(('User.notifications', 'notifications' in user_rels))

# 5. Required User columns are non-nullable
users_table = Base.metadata.tables['users']
for col_name in ['email', 'hashed_password', 'full_name', 'role']:
    col = users_table.c[col_name]
    checks.append((f'users.{col_name} NOT NULL', not col.nullable))

# 6. users.email has unique index
email_unique = any(
    idx.unique and 'email' in [c.name for c in idx.columns]
    for idx in users_table.indexes
)
checks.append(('users.email unique-indexed', email_unique))

# 7. loans.application_id is unique (UniqueConstraint or unique index)
loans_table = Base.metadata.tables['loans']
loan_app_id_unique = any(
    (
        c.__class__.__name__ == 'UniqueConstraint' and
        any(col.name == 'application_id' for col in c.columns)
    )
    for c in loans_table.constraints
)
checks.append(('loans.application_id unique', loan_app_id_unique))

# 8. Assessment stores required columns
assess_table = Base.metadata.tables['assessments']
required_assess_cols = [
    'approval_prediction', 'approval_probability', 'approval_model_version',
    'anomaly_score', 'anomaly_threshold', 'anomaly_flagged',
    'isolation_model_version', 'input_snapshot', 'status',
]
for c in required_assess_cols:
    checks.append((f'assessments.{c}', c in assess_table.c))

# 9. Key foreign keys
fk_checks = [
    ('loan_applications.user_id -> users', 'users.id'),
    ('documents.application_id -> loan_applications', 'loan_applications.id'),
    ('status_history.application_id -> loan_applications', 'loan_applications.id'),
    ('assessments.application_id -> loan_applications', 'loan_applications.id'),
    ('loans.application_id -> loan_applications', 'loan_applications.id'),
    ('repayments.loan_id -> loans', 'loans.id'),
    ('audit_logs.user_id -> users', 'users.id'),
]
for desc, target in fk_checks:
    table_name = desc.split('.')[0]
    t = Base.metadata.tables[table_name]
    fk_targets = {str(fk.target_fullname) for fk in t.foreign_keys}
    checks.append((f'FK: {desc}', target in fk_targets))

# ── Results ──────────────────────────────────────────────────────────────────
passed = sum(1 for _, ok in checks if ok)
failed = [(n, ok) for n, ok in checks if not ok]

for name, ok in checks:
    print(f"  {'OK  ' if ok else 'FAIL'}: {name}")

print(f"\n{passed}/{len(checks)} schema checks passed.")
if failed:
    print(f"\nFAILED checks:")
    for name, _ in failed:
        print(f"  - {name}")
    sys.exit(1)
else:
    print("All schema checks passed.")
