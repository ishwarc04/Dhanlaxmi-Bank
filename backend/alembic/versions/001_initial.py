"""Initial migration

Revision ID: 001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table('users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('role', sa.Enum('customer', 'admin', name='userrole'), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # Loan Applications
    op.create_table('loan_applications',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('status', sa.Enum('draft', 'submitted', 'under_review', 'needs_information', 'approved', 'rejected', name='applicationstatus'), nullable=False),
        sa.Column('applicant_income', sa.Float(), nullable=True),
        sa.Column('coapplicant_income', sa.Float(), nullable=True),
        sa.Column('employment_status', sa.String(50), nullable=True),
        sa.Column('age', sa.Integer(), nullable=True),
        sa.Column('marital_status', sa.String(20), nullable=True),
        sa.Column('dependents', sa.Float(), nullable=True),
        sa.Column('savings', sa.Float(), nullable=True),
        sa.Column('loan_amount', sa.Float(), nullable=True),
        sa.Column('loan_term', sa.Integer(), nullable=True),
        sa.Column('loan_purpose', sa.String(50), nullable=True),
        sa.Column('property_area', sa.String(50), nullable=True),
        sa.Column('education_level', sa.String(50), nullable=True),
        sa.Column('gender', sa.String(20), nullable=True),
        sa.Column('employer_category', sa.String(50), nullable=True),
        sa.Column('credit_score', sa.Float(), nullable=True),
        sa.Column('credit_history_years', sa.Float(), nullable=True),
        sa.Column('late_payments_12m', sa.Integer(), nullable=True),
        sa.Column('existing_loans', sa.Integer(), nullable=True),
        sa.Column('existing_monthly_emi', sa.Float(), nullable=True),
        sa.Column('employment_years', sa.Float(), nullable=True),
        sa.Column('collateral_value', sa.Float(), nullable=True),
        sa.Column('quoted_interest_rate', sa.Float(), nullable=True),
        sa.Column('proposed_monthly_emi', sa.Float(), nullable=True),
        sa.Column('dti_ratio', sa.Float(), nullable=True),
        sa.Column('decision_reason', sa.Text(), nullable=True),
        sa.Column('decided_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.Column('updated_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_app_user', 'loan_applications', ['user_id'])
    op.create_index('idx_app_status', 'loan_applications', ['status'])

    # Documents
    op.create_table('documents',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('application_id', sa.String(), sa.ForeignKey('loan_applications.id'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_filename', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(100), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_doc_app', 'documents', ['application_id'])

    # Status History
    op.create_table('status_history',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('application_id', sa.String(), sa.ForeignKey('loan_applications.id'), nullable=False),
        sa.Column('old_status', sa.Enum('draft', 'submitted', 'under_review', 'needs_information', 'approved', 'rejected', name='applicationstatus', create_type=False), nullable=True),
        sa.Column('new_status', sa.Enum('draft', 'submitted', 'under_review', 'needs_information', 'approved', 'rejected', name='applicationstatus', create_type=False), nullable=False),
        sa.Column('changed_by', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_sh_app', 'status_history', ['application_id'])

    # Assessments
    op.create_table('assessments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('application_id', sa.String(), sa.ForeignKey('loan_applications.id'), nullable=False),
        sa.Column('input_snapshot', sa.JSON(), nullable=False),
        sa.Column('feature_values', sa.JSON(), nullable=True),
        sa.Column('approval_prediction', sa.Integer(), nullable=True),
        sa.Column('approval_probability', sa.Float(), nullable=True),
        sa.Column('approval_model_version', sa.String(50), nullable=True),
        sa.Column('anomaly_score', sa.Float(), nullable=True),
        sa.Column('anomaly_threshold', sa.Float(), nullable=True),
        sa.Column('anomaly_flagged', sa.Boolean(), nullable=True),
        sa.Column('isolation_model_version', sa.String(50), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_assess_app', 'assessments', ['application_id'])

    # Notifications
    op.create_table('notifications',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('application_id', sa.String(), sa.ForeignKey('loan_applications.id'), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_notif_user', 'notifications', ['user_id'])

    # Loans
    op.create_table('loans',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('application_id', sa.String(), sa.ForeignKey('loan_applications.id'), nullable=False),
        sa.Column('principal_amount', sa.Float(), nullable=False),
        sa.Column('interest_rate', sa.Float(), nullable=False),
        sa.Column('term_months', sa.Integer(), nullable=False),
        sa.Column('monthly_emi', sa.Float(), nullable=False),
        sa.Column('total_payable', sa.Float(), nullable=False),
        sa.Column('disbursed_at', sa.DateTime(timezone=True)),
        sa.Column('is_simulated', sa.Boolean(), default=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('application_id'),
    )

    # Repayments
    op.create_table('repayments',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('loan_id', sa.String(), sa.ForeignKey('loans.id'), nullable=False),
        sa.Column('installment_number', sa.Integer(), nullable=False),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('principal_component', sa.Float(), nullable=False),
        sa.Column('interest_component', sa.Float(), nullable=False),
        sa.Column('emi_amount', sa.Float(), nullable=False),
        sa.Column('outstanding_balance', sa.Float(), nullable=False),
        sa.Column('is_paid', sa.Boolean(), default=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_simulated', sa.Boolean(), default=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_rep_loan', 'repayments', ['loan_id'])

    # Audit Logs
    op.create_table('audit_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=True),
        sa.Column('entity_id', sa.String(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_audit_entity', 'audit_logs', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('repayments')
    op.drop_table('loans')
    op.drop_table('notifications')
    op.drop_table('assessments')
    op.drop_table('status_history')
    op.drop_table('documents')
    op.drop_table('loan_applications')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS applicationstatus")
    op.execute("DROP TYPE IF EXISTS userrole")
