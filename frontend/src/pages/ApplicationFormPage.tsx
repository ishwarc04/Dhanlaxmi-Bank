import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { applicationsApi, generalApi, apiError } from "../api";
import type { LoanApplication, ApplicationDraftPayload, EMICalculatorResponse } from "../types";
import { Spinner } from "../components/Spinner";
import { formatINR } from "../utils";

const EMPLOYMENT_STATUS = ["Salaried", "Self-employed", "Contract", "Unemployed"];
const MARITAL_STATUS = ["Married", "Single"];
const LOAN_PURPOSE = ["Home", "Car", "Business", "Education", "Personal"];
const PROPERTY_AREA = ["Urban", "Semiurban", "Rural"];
const EDUCATION_LEVEL = ["Graduate", "Not Graduate"];
const GENDER = ["Male", "Female"];
const EMPLOYER_CATEGORY = ["Government", "Private", "MNC", "Business", "Unemployed"];

function numOrNull(v: string): number | undefined {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}
function intOrNull(v: string): number | undefined {
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

export function ApplicationFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    applicant_income: "",
    coapplicant_income: "",
    employment_status: "",
    age: "",
    marital_status: "",
    dependents: "",
    savings: "",
    loan_amount: "",
    loan_term: "",
    loan_purpose: "",
    property_area: "",
    education_level: "",
    gender: "",
    employer_category: "",
  });

  const [emiPreview, setEmiPreview] = useState<EMICalculatorResponse | null>(null);
  const [emiLoading, setEmiLoading] = useState(false);

  // Load existing draft
  useEffect(() => {
    if (!id) return;
    applicationsApi.get(id)
      .then((app: LoanApplication) => {
        setForm({
          applicant_income: app.applicant_income?.toString() ?? "",
          coapplicant_income: app.coapplicant_income?.toString() ?? "",
          employment_status: app.employment_status ?? "",
          age: app.age?.toString() ?? "",
          marital_status: app.marital_status ?? "",
          dependents: app.dependents?.toString() ?? "",
          savings: app.savings?.toString() ?? "",
          loan_amount: app.loan_amount?.toString() ?? "",
          loan_term: app.loan_term?.toString() ?? "",
          loan_purpose: app.loan_purpose ?? "",
          property_area: app.property_area ?? "",
          education_level: app.education_level ?? "",
          gender: app.gender ?? "",
          employer_category: app.employer_category ?? "",
        });
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [id]);

  // Live EMI preview
  useEffect(() => {
    const principal = parseFloat(form.loan_amount);
    const term = parseInt(form.loan_term, 10);
    if (!isNaN(principal) && principal > 0 && !isNaN(term) && term > 0) {
      setEmiLoading(true);
      generalApi.emiCalculator(principal, 10, term)
        .then(setEmiPreview)
        .catch(() => setEmiPreview(null))
        .finally(() => setEmiLoading(false));
    } else {
      setEmiPreview(null);
    }
  }, [form.loan_amount, form.loan_term]);

  const buildPayload = (): ApplicationDraftPayload => ({
    applicant_income: numOrNull(form.applicant_income),
    coapplicant_income: numOrNull(form.coapplicant_income),
    employment_status: form.employment_status || undefined,
    age: intOrNull(form.age),
    marital_status: form.marital_status || undefined,
    dependents: numOrNull(form.dependents),
    savings: numOrNull(form.savings),
    loan_amount: numOrNull(form.loan_amount),
    loan_term: intOrNull(form.loan_term),
    loan_purpose: form.loan_purpose || undefined,
    property_area: form.property_area || undefined,
    education_level: form.education_level || undefined,
    gender: form.gender || undefined,
    employer_category: form.employer_category || undefined,
  });

  const saveDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      let app: LoanApplication;
      if (id) {
        app = await applicationsApi.update(id, buildPayload());
      } else {
        app = await applicationsApi.create(buildPayload());
      }
      navigate(`/applications/${app.id}`);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveDraft();
  };

  const f = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
    disabled: saving,
    className: "form-input" as const,
  });

  const sel = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
    disabled: saving,
    className: "form-select" as const,
  });

  if (loading) return <div className="container page"><Spinner /></div>;

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h1>{isEdit ? "Edit Application" : "New Application"}</h1>
          <p className="text-muted text-sm">
            Fill in your details and save as a draft. Submit when ready.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        {/* Personal Information */}
        <div className="card">
          <div className="section-title">Personal Information</div>
          <div className="grid grid-3">
            <div className="form-group">
              <label className="form-label" htmlFor="gender">Gender</label>
              <select id="gender" {...sel("gender")}>
                <option value="">Select</option>
                {GENDER.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="age">Age</label>
              <input id="age" type="number" min="18" max="100" {...f("age")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="marital_status">Marital Status</label>
              <select id="marital_status" {...sel("marital_status")}>
                <option value="">Select</option>
                {MARITAL_STATUS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="dependents">Dependents</label>
              <input id="dependents" type="number" min="0" step="1" {...f("dependents")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="education_level">Education</label>
              <select id="education_level" {...sel("education_level")}>
                <option value="">Select</option>
                {EDUCATION_LEVEL.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="property_area">Property Area</label>
              <select id="property_area" {...sel("property_area")}>
                <option value="">Select</option>
                {PROPERTY_AREA.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Employment & Income */}
        <div className="card">
          <div className="section-title">Employment &amp; Income</div>
          <div className="grid grid-3">
            <div className="form-group">
              <label className="form-label" htmlFor="employment_status">Employment Status</label>
              <select id="employment_status" {...sel("employment_status")}>
                <option value="">Select</option>
                {EMPLOYMENT_STATUS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="employer_category">Employer Category</label>
              <select id="employer_category" {...sel("employer_category")}>
                <option value="">Select</option>
                {EMPLOYER_CATEGORY.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="applicant_income">
                Monthly Income (INR) <span className="required">*</span>
              </label>
              <input id="applicant_income" type="number" min="0" step="100" {...f("applicant_income")} />
              <p className="form-hint">Your gross monthly income</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="coapplicant_income">
                Co-applicant Monthly Income (INR)
              </label>
              <input id="coapplicant_income" type="number" min="0" step="100" {...f("coapplicant_income")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="savings">Savings Balance (INR)</label>
              <input id="savings" type="number" min="0" step="100" {...f("savings")} />
            </div>
          </div>
        </div>

        {/* Loan Details */}
        <div className="card">
          <div className="section-title">Loan Details</div>
          <div className="grid grid-3">
            <div className="form-group">
              <label className="form-label" htmlFor="loan_amount">
                Loan Amount (INR) <span className="required">*</span>
              </label>
              <input id="loan_amount" type="number" min="1" step="1000" {...f("loan_amount")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loan_term">
                Loan Term (months) <span className="required">*</span>
              </label>
              <input id="loan_term" type="number" min="1" max="600" step="1" {...f("loan_term")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="loan_purpose">
                Loan Purpose <span className="required">*</span>
              </label>
              <select id="loan_purpose" {...sel("loan_purpose")}>
                <option value="">Select</option>
                {LOAN_PURPOSE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* EMI Preview */}
          {(emiLoading || emiPreview) && (
            <div style={{ marginTop: ".75rem", padding: ".75rem", background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <p className="text-sm fw-600" style={{ marginBottom: ".25rem" }}>
                Estimated EMI Preview (at 10% indicative rate)
              </p>
              {emiLoading && <span className="text-sm text-muted">Calculating...</span>}
              {!emiLoading && emiPreview && (
                <div className="grid grid-3">
                  <div>
                    <div className="stat-label">Monthly EMI</div>
                    <div className="fw-600">{formatINR(emiPreview.monthly_emi)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Total Payable</div>
                    <div>{formatINR(emiPreview.total_payment)}</div>
                  </div>
                  <div>
                    <div className="stat-label">Total Interest</div>
                    <div>{formatINR(emiPreview.total_interest)}</div>
                  </div>
                </div>
              )}
              <p className="text-sm text-muted" style={{ marginTop: ".5rem", marginBottom: 0 }}>
                Final EMI is calculated by the loan officer based on the actual approved rate.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-sm flex-end" style={{ marginTop: "1.5rem" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
