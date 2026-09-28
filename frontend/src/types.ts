// FinTrust — shared TypeScript types matching backend schemas

export type UserRole = "customer" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected";

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  category: string | null;
  uploaded_at: string;
}

export interface StatusHistoryEntry {
  id: string;
  old_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  changed_by: string;
  reason: string | null;
  created_at: string;
  user_name: string | null;
}

export interface Assessment {
  id: string;
  approval_prediction: number | null;
  approval_probability: number | null;
  approval_model_version: string | null;
  anomaly_score: number | null;
  anomaly_threshold: number | null;
  anomaly_flagged: boolean | null;
  isolation_model_version: string | null;
  status: "completed" | "error" | "unavailable";
  error_message: string | null;
  created_at: string;
}

export interface LoanApplication {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  applicant_income: number | null;
  coapplicant_income: number | null;
  employment_status: string | null;
  age: number | null;
  marital_status: string | null;
  dependents: number | null;
  savings: number | null;
  loan_amount: number | null;
  loan_term: number | null;
  loan_purpose: string | null;
  property_area: string | null;
  education_level: string | null;
  gender: string | null;
  employer_category: string | null;
  credit_score: number | null;
  credit_history_years: number | null;
  late_payments_12m: number | null;
  existing_loans: number | null;
  existing_monthly_emi: number | null;
  employment_years: number | null;
  collateral_value: number | null;
  quoted_interest_rate: number | null;
  proposed_monthly_emi: number | null;
  dti_ratio: number | null;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  applicant_name: string | null;
  documents: Document[];
  status_history: StatusHistoryEntry[];
}

export interface LoanApplicationListItem {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  loan_amount: number | null;
  loan_purpose: string | null;
  applicant_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Repayment {
  id: string;
  installment_number: number;
  due_date: string;
  principal_component: number;
  interest_component: number;
  emi_amount: number;
  outstanding_balance: number;
  is_paid: boolean;
  paid_at: string | null;
  is_simulated: boolean;
}

export interface Loan {
  id: string;
  application_id: string;
  principal_amount: number;
  interest_rate: number;
  term_months: number;
  monthly_emi: number;
  total_payable: number;
  disbursed_at: string;
  is_simulated: boolean;
  repayments: Repayment[];
}

export interface Notification {
  id: string;
  application_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_applications: number;
  pending_review: number;
  approved: number;
  rejected: number;
  needs_info: number;
  drafts: number;
  total_disbursed: number;
  avg_loan_amount: number;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
}

export interface EMICalculatorResponse {
  monthly_emi: number;
  total_payment: number;
  total_interest: number;
  principal: number;
  annual_rate: number;
  term_months: number;
}

export interface ModelStatus {
  approval_available: boolean;
  isolation_available: boolean;
  load_errors: string[];
}

// Form payloads
export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ApplicationDraftPayload {
  applicant_income?: number;
  coapplicant_income?: number;
  employment_status?: string;
  age?: number;
  marital_status?: string;
  dependents?: number;
  savings?: number;
  loan_amount?: number;
  loan_term?: number;
  loan_purpose?: string;
  property_area?: string;
  education_level?: string;
  gender?: string;
  employer_category?: string;
}

export interface StaffVerificationPayload {
  credit_score?: number;
  credit_history_years?: number;
  late_payments_12m?: number;
  existing_loans?: number;
  existing_monthly_emi?: number;
  employment_years?: number;
  collateral_value?: number;
  quoted_interest_rate?: number;
}

export interface DecisionPayload {
  decision: "approved" | "rejected" | "needs_information";
  reason: string;
}
