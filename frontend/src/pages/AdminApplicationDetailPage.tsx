import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminApi, applicationsApi, apiError } from "../api";
import type {
  LoanApplication,
  Assessment,
  Loan,
  StaffVerificationPayload,
  DecisionPayload,
} from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { formatINR, formatDateTime, pct } from "../utils";

// ─── Assessment panel ────────────────────────────────────────────────────────

function AssessmentPanel({ assessment }: { assessment: Assessment }) {
  if (assessment.status === "unavailable") {
    return (
      <div className="model-card model-unavailable" style={{ marginBottom: ".75rem" }}>
        <p className="fw-600 text-sm" style={{ color: "var(--warning)", marginBottom: ".25rem" }}>
          Model Unavailable
        </p>
        <p className="text-sm">
          {assessment.error_message ?? "Models could not be loaded."}
        </p>
        <p className="text-sm text-muted">
          Manual review is required. The officer workflow is still available.
        </p>
      </div>
    );
  }

  if (assessment.status === "error") {
    return (
      <div
        className="model-card"
        style={{ borderColor: "var(--danger)", marginBottom: ".75rem" }}
      >
        <p className="fw-600 text-sm text-danger" style={{ marginBottom: ".25rem" }}>
          Assessment Error
        </p>
        <p className="text-sm">{assessment.error_message}</p>
      </div>
    );
  }

  const prob = assessment.approval_probability ?? 0;
  const probPct = Math.round(prob * 100);
  const isHighProb = prob >= 0.5;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1rem",
        marginBottom: ".75rem",
      }}
    >
      {/* Approval model */}
      <div className="model-card">
        <div className="section-title" style={{ marginBottom: ".5rem" }}>
          Approval Model Assessment (XGBoost)
        </div>
        <div
          className="alert alert-info"
          style={{ fontSize: ".775rem", marginBottom: ".75rem", padding: ".5rem .75rem" }}
        >
          This is a model assessment, not an automatic lending decision. The loan
          officer makes the final determination. This academic model was trained on
          synthetic data and is not fairness-certified.
        </div>
        {assessment.approval_prediction !== null ? (
          <>
            <div className="grid grid-2" style={{ gap: ".5rem", marginBottom: ".5rem" }}>
              <div>
                <div className="stat-label">Suggested Class</div>
                <div
                  className="fw-600"
                  style={{
                    color:
                      assessment.approval_prediction === 1
                        ? "var(--success)"
                        : "var(--danger)",
                  }}
                >
                  {assessment.approval_prediction === 1 ? "Approve" : "Decline"}
                </div>
              </div>
              <div>
                <div className="stat-label">Approval Probability</div>
                <div className="fw-600">{probPct}%</div>
              </div>
            </div>
            <div
              className="prob-bar"
              role="progressbar"
              aria-valuenow={probPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`prob-fill${!isHighProb ? " prob-fill-danger" : ""}`}
                style={{ width: `${probPct}%` }}
              />
            </div>
            <p className="text-sm text-muted" style={{ marginTop: ".35rem" }}>
              Model version: {assessment.approval_model_version ?? "unknown"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">No approval prediction available.</p>
        )}
      </div>

      {/* Isolation model */}
      <div className={`model-card${assessment.anomaly_flagged ? " model-flagged" : ""}`}>
        <div className="section-title" style={{ marginBottom: ".5rem" }}>
          Anomaly Assessment (Isolation Forest)
        </div>
        <div
          className="alert alert-info"
          style={{ fontSize: ".775rem", marginBottom: ".75rem", padding: ".5rem .75rem" }}
        >
          Anomaly score is <strong>not</strong> a probability. A flag means{" "}
          <strong>manual review recommended</strong> — not fraud and not automatic
          rejection. No flag does not guarantee safety.
        </div>
        {assessment.anomaly_score !== null ? (
          <>
            <div className="grid grid-2" style={{ gap: ".5rem", marginBottom: ".5rem" }}>
              <div>
                <div className="stat-label">Anomaly Score</div>
                <div className="fw-600">{assessment.anomaly_score.toFixed(4)}</div>
              </div>
              <div>
                <div className="stat-label">Threshold</div>
                <div>{assessment.anomaly_threshold?.toFixed(4) ?? "—"}</div>
              </div>
            </div>
            <div style={{ marginBottom: ".35rem" }}>
              <span
                className={`badge ${
                  assessment.anomaly_flagged
                    ? "badge-needs_information"
                    : "badge-approved"
                }`}
              >
                {assessment.anomaly_flagged ? "Manual Review Recommended" : "No Flag"}
              </span>
            </div>
            <p className="text-sm text-muted">
              Model version: {assessment.isolation_model_version ?? "unknown"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">No anomaly assessment available.</p>
        )}
      </div>
    </div>
  );
}

// ─── Loan panel (inline, no separate route needed) ───────────────────────────

function LoanPanel({ loan }: { loan: Loan }) {
  return (
    <div className="card" style={{ borderColor: "var(--success)" }}>
      <div className="section-title">Approved Loan — Simulated</div>
      <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
        This is a simulated loan record for academic purposes only. No real money is
        disbursed or transferred.
      </div>

      <div className="grid grid-4" style={{ marginBottom: "1.25rem" }}>
        {(
          [
            ["Principal", formatINR(loan.principal_amount)],
            ["Interest Rate", `${loan.interest_rate}% p.a.`],
            ["Term", `${loan.term_months} months`],
            ["Monthly EMI", formatINR(loan.monthly_emi)],
            ["Total Payable", formatINR(loan.total_payable)],
          ] as [string, string][]
        ).map(([l, v]) => (
          <div key={l}>
            <div className="stat-label">{l}</div>
            <div className="fw-600">{v}</div>
          </div>
        ))}
      </div>

      {loan.repayments.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: "1rem" }}>
            Repayment Schedule ({loan.repayments.length} installments)
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due Date</th>
                  <th>EMI</th>
                  <th>Principal</th>
                  <th>Interest</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loan.repayments.slice(0, 12).map((r) => (
                  <tr key={r.id}>
                    <td>{r.installment_number}</td>
                    <td className="text-sm">
                      {new Date(r.due_date).toLocaleDateString("en-IN")}
                    </td>
                    <td>{formatINR(r.emi_amount)}</td>
                    <td className="text-sm">{formatINR(r.principal_component)}</td>
                    <td className="text-sm">{formatINR(r.interest_component)}</td>
                    <td className="text-sm">{formatINR(r.outstanding_balance)}</td>
                    <td>
                      <span
                        className={`badge ${r.is_paid ? "badge-approved" : "badge-draft"}`}
                      >
                        {r.is_paid ? "Paid" : "Due"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loan.repayments.length > 12 && (
              <p className="text-sm text-muted" style={{ padding: ".5rem .9rem" }}>
                Showing first 12 of {loan.repayments.length} installments.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main admin detail page ───────────────────────────────────────────────────

export function AdminApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<LoanApplication | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Verification form
  const [verifyForm, setVerifyForm] = useState({
    credit_score: "",
    credit_history_years: "",
    late_payments_12m: "",
    existing_loans: "",
    existing_monthly_emi: "",
    employment_years: "",
    collateral_value: "",
    quoted_interest_rate: "",
  });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState(false);

  // Assessment
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);

  // Decision
  const [decision, setDecision] = useState<
    "approved" | "rejected" | "needs_information"
  >("approved");
  const [decisionReason, setDecisionReason] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);

  const loadLoan = (appId: string) => {
    setLoanLoading(true);
    adminApi
      .getLoan(appId)
      .then(setLoan)
      .catch(() => setLoan(null))
      .finally(() => setLoanLoading(false));
  };

  const reload = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([adminApi.getApplication(id), adminApi.listAssessments(id)])
      .then(([a, ass]) => {
        setApp(a);
        setAssessments(ass);
        setVerifyForm({
          credit_score: a.credit_score?.toString() ?? "",
          credit_history_years: a.credit_history_years?.toString() ?? "",
          late_payments_12m: a.late_payments_12m?.toString() ?? "",
          existing_loans: a.existing_loans?.toString() ?? "",
          existing_monthly_emi: a.existing_monthly_emi?.toString() ?? "",
          employment_years: a.employment_years?.toString() ?? "",
          collateral_value: a.collateral_value?.toString() ?? "",
          quoted_interest_rate: a.quoted_interest_rate?.toString() ?? "",
        });
        if (a.status === "approved") loadLoan(a.id);
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [id]);

  const handleVerify = async () => {
    if (!id) return;
    setVerifying(true);
    setVerifyError(null);
    setVerifySuccess(false);
    const n = (v: string) => { const x = parseFloat(v); return isNaN(x) ? undefined : x; };
    const iv = (v: string) => { const x = parseInt(v, 10); return isNaN(x) ? undefined : x; };
    const payload: StaffVerificationPayload = {};
    if (verifyForm.credit_score) payload.credit_score = n(verifyForm.credit_score);
    if (verifyForm.credit_history_years) payload.credit_history_years = n(verifyForm.credit_history_years);
    if (verifyForm.late_payments_12m) payload.late_payments_12m = iv(verifyForm.late_payments_12m);
    if (verifyForm.existing_loans) payload.existing_loans = iv(verifyForm.existing_loans);
    if (verifyForm.existing_monthly_emi) payload.existing_monthly_emi = n(verifyForm.existing_monthly_emi);
    if (verifyForm.employment_years) payload.employment_years = n(verifyForm.employment_years);
    if (verifyForm.collateral_value) payload.collateral_value = n(verifyForm.collateral_value);
    if (verifyForm.quoted_interest_rate) payload.quoted_interest_rate = n(verifyForm.quoted_interest_rate);
    try {
      const updated = await adminApi.verify(id, payload);
      setApp(updated);
      setVerifySuccess(true);
    } catch (e) {
      setVerifyError(apiError(e));
    } finally {
      setVerifying(false);
    }
  };

  const handleAssess = async () => {
    if (!id) return;
    setAssessing(true);
    setAssessError(null);
    try {
      const assessment = await adminApi.assess(id);
      setAssessments((prev) => [assessment, ...prev]);
    } catch (e) {
      setAssessError(apiError(e));
    } finally {
      setAssessing(false);
    }
  };

  const handleDecide = async () => {
    if (!id) return;
    if (!decisionReason.trim()) {
      setDecideError("A reason is required for all decisions.");
      return;
    }
    setDeciding(true);
    setDecideError(null);
    const payload: DecisionPayload = { decision, reason: decisionReason };
    try {
      const updated = await adminApi.decide(id, payload);
      setApp(updated);
      setDecisionReason("");
      if (decision === "approved") loadLoan(updated.id);
    } catch (e) {
      setDecideError(apiError(e));
    } finally {
      setDeciding(false);
    }
  };

  const vf = (key: keyof typeof verifyForm) => ({
    value: verifyForm[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setVerifyForm((f) => ({ ...f, [key]: e.target.value })),
    disabled: verifying,
    className: "form-input" as const,
  });

  if (loading) return <div className="container page"><Spinner /></div>;
  if (error && !app)
    return <div className="container page"><div className="alert alert-error">{error}</div></div>;
  if (!app) return null;

  const canVerify = ["submitted", "under_review"].includes(app.status);
  const canDecide = ["submitted", "under_review"].includes(app.status);
  const isFinal = ["approved", "rejected"].includes(app.status);

  return (
    <div className="container page">
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
        <div>
          <div className="flex gap-sm" style={{ alignItems: "center" }}>
            <h1 style={{ margin: 0 }}>Application Review</h1>
            <StatusBadge status={app.status} />
          </div>
          <p className="text-muted text-sm" style={{ fontFamily: "monospace", marginTop: ".25rem" }}>
            {app.id}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Applicant */}
      <div className="card">
        <div className="section-title">Applicant</div>
        <div className="grid grid-4">
          {(
            [
              ["Name", app.applicant_name],
              ["Gender", app.gender],
              ["Age", app.age != null ? `${app.age} years` : null],
              ["Marital Status", app.marital_status],
              ["Dependents", app.dependents != null ? String(app.dependents) : null],
              ["Education", app.education_level],
              ["Employment", app.employment_status],
              ["Employer", app.employer_category],
            ] as [string, string | null][]
          ).map(([l, v]) => (
            <div key={l}>
              <div className="stat-label">{l}</div>
              <div>{v ?? <span className="text-muted">—</span>}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial info */}
      <div className="card">
        <div className="section-title">Financial Information</div>
        <div className="grid grid-4">
          {(
            [
              ["Applicant Income", app.applicant_income != null ? `${formatINR(app.applicant_income)}/mo` : null],
              ["Co-applicant Income", app.coapplicant_income != null ? `${formatINR(app.coapplicant_income)}/mo` : null],
              ["Savings", app.savings != null ? formatINR(app.savings) : null],
              ["Property Area", app.property_area],
              ["Loan Amount", app.loan_amount != null ? formatINR(app.loan_amount) : null],
              ["Loan Term", app.loan_term != null ? `${app.loan_term} months` : null],
              ["Loan Purpose", app.loan_purpose],
              ["Quoted Rate", app.quoted_interest_rate != null ? `${app.quoted_interest_rate}% p.a.` : null],
              ["Proposed EMI", app.proposed_monthly_emi != null ? `${formatINR(app.proposed_monthly_emi)}/mo` : null],
              ["DTI Ratio", app.dti_ratio != null ? pct(app.dti_ratio) : null],
            ] as [string, string | null][]
          ).map(([l, v]) => (
            <div key={l}>
              <div className="stat-label">{l}</div>
              <div>{v ?? <span className="text-muted">—</span>}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-muted" style={{ marginTop: ".5rem", marginBottom: 0 }}>
          Proposed EMI and DTI are calculated server-side. Do not use client-supplied values.
        </p>
      </div>

      {/* Documents */}
      <div className="card">
        <div className="section-title">Documents ({app.documents.length})</div>
        {app.documents.length === 0 ? (
          <p className="text-muted text-sm">No documents uploaded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {app.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="text-sm">{doc.original_filename}</td>
                    <td className="text-sm">{doc.category ?? "—"}</td>
                    <td className="text-sm text-muted">{(doc.file_size / 1024).toFixed(1)} KB</td>
                    <td className="text-sm text-muted">{formatDateTime(doc.uploaded_at)}</td>
                    <td>
                      <a
                        href={applicationsApi.documentDownloadUrl(app.id, doc.id)}
                        className="btn btn-outline btn-sm"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff verification */}
      {canVerify && (
        <div className="card">
          <div className="section-title">Staff Verification</div>
          <p className="text-sm text-muted" style={{ marginBottom: "1rem" }}>
            Enter credit information. The server computes EMI and DTI. This does not
            represent a real credit-bureau integration.
          </p>
          {verifySuccess && (
            <div className="alert alert-success">
              Verification saved. EMI and DTI have been recalculated server-side.
            </div>
          )}
          {verifyError && <div className="alert alert-error">{verifyError}</div>}
          <div className="grid grid-4">
            <div className="form-group">
              <label className="form-label" htmlFor="v_credit_score">Credit Score</label>
              <input id="v_credit_score" type="number" min="300" max="900" {...vf("credit_score")} />
              <p className="form-hint">300–900</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_credit_history">Credit History (years)</label>
              <input id="v_credit_history" type="number" min="0" step="0.1" {...vf("credit_history_years")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_late_payments">Late Payments (12m)</label>
              <input id="v_late_payments" type="number" min="0" step="1" {...vf("late_payments_12m")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_existing_loans">Existing Loans</label>
              <input id="v_existing_loans" type="number" min="0" step="1" {...vf("existing_loans")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_existing_emi">Existing EMI (INR/mo)</label>
              <input id="v_existing_emi" type="number" min="0" {...vf("existing_monthly_emi")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_employment_years">Employment Years</label>
              <input id="v_employment_years" type="number" min="0" step="0.1" {...vf("employment_years")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_collateral">Collateral Value (INR)</label>
              <input id="v_collateral" type="number" min="0" {...vf("collateral_value")} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="v_rate">
                Interest Rate (% p.a.) <span className="required">*</span>
              </label>
              <input id="v_rate" type="number" min="0" max="50" step="0.01" {...vf("quoted_interest_rate")} />
              <p className="form-hint">Required to compute proposed EMI</p>
            </div>
          </div>
          <div className="flex-end">
            <button className="btn btn-primary" onClick={handleVerify} disabled={verifying}>
              {verifying ? "Saving..." : "Save Verification"}
            </button>
          </div>
        </div>
      )}

      {/* ML Assessment */}
      <div className="card">
        <div className="section-title">ML Assessment</div>
        {assessments.length > 0 && <AssessmentPanel assessment={assessments[0]} />}
        {assessError && <div className="alert alert-error">{assessError}</div>}
        {canVerify && (
          <div className="flex gap-sm" style={{ alignItems: "center" }}>
            <button className="btn btn-accent" onClick={handleAssess} disabled={assessing}>
              {assessing ? "Running..." : assessments.length > 0 ? "Re-run Assessment" : "Run Assessment"}
            </button>
            {assessments.length > 0 && (
              <span className="text-sm text-muted">
                Last run: {formatDateTime(assessments[0].created_at)}
              </span>
            )}
          </div>
        )}
        {assessments.length === 0 && !canVerify && (
          <p className="text-muted text-sm">No assessment on record.</p>
        )}
        {assessments.length > 1 && (
          <details style={{ marginTop: "1rem" }}>
            <summary className="text-sm text-muted" style={{ cursor: "pointer" }}>
              Previous assessments ({assessments.length - 1})
            </summary>
            {assessments.slice(1).map((a) => (
              <div
                key={a.id}
                style={{ marginTop: ".5rem", padding: ".5rem", background: "var(--surface2)", border: "1px solid var(--border)" }}
              >
                <span className="text-sm text-muted">{formatDateTime(a.created_at)}</span>
                {a.approval_prediction !== null && (
                  <span className="text-sm" style={{ marginLeft: "1rem" }}>
                    Pred: {a.approval_prediction === 1 ? "Approve" : "Decline"} | Prob:{" "}
                    {Math.round((a.approval_probability ?? 0) * 100)}%
                  </span>
                )}
              </div>
            ))}
          </details>
        )}
      </div>

      {/* Officer Decision */}
      {canDecide && !isFinal && (
        <div className="card" style={{ borderColor: "var(--primary)" }}>
          <div className="section-title">Officer Decision</div>
          <p className="text-sm text-muted" style={{ marginBottom: "1rem" }}>
            This decision is made independently of the model assessment. A reason is
            mandatory for all decisions.
          </p>
          {decideError && <div className="alert alert-error">{decideError}</div>}
          <div className="grid grid-3" style={{ marginBottom: "1rem" }}>
            {(["approved", "rejected", "needs_information"] as const).map((d) => (
              <button
                key={d}
                className={`btn ${decision === d ? "btn-primary" : "btn-outline"}`}
                onClick={() => setDecision(d)}
              >
                {d === "needs_information"
                  ? "Request Clarification"
                  : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="decisionReason">
              Reason / Notes <span className="required">*</span>
            </label>
            <textarea
              id="decisionReason"
              className="form-textarea"
              rows={4}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Required — provide reasoning for this decision..."
              disabled={deciding}
            />
            <p className="form-hint">Required for approvals, rejections and clarifications.</p>
          </div>
          <div className="flex-end">
            <button
              className={`btn btn-lg ${
                decision === "rejected"
                  ? "btn-danger"
                  : decision === "approved"
                  ? "btn-accent"
                  : "btn-primary"
              }`}
              onClick={handleDecide}
              disabled={deciding || !decisionReason.trim()}
            >
              {deciding
                ? "Submitting..."
                : `Confirm: ${
                    decision === "needs_information"
                      ? "Request Info"
                      : decision.charAt(0).toUpperCase() + decision.slice(1)
                  }`}
            </button>
          </div>
        </div>
      )}

      {/* Final decision display */}
      {isFinal && (
        <div
          className="card"
          style={{
            borderColor: app.status === "approved" ? "var(--success)" : "var(--danger)",
          }}
        >
          <div className="section-title">Final Decision</div>
          <div className="flex gap-sm" style={{ alignItems: "center", marginBottom: ".5rem" }}>
            <StatusBadge status={app.status} />
            {app.decided_at && (
              <span className="text-sm text-muted">{formatDateTime(app.decided_at)}</span>
            )}
          </div>
          {app.decision_reason && (
            <p>
              <strong>Reason:</strong> {app.decision_reason}
            </p>
          )}
        </div>
      )}

      {/* Loan details — inline for approved applications */}
      {app.status === "approved" && (
        <>
          {loanLoading && (
            <div className="card">
              <Spinner text="Loading loan details..." />
            </div>
          )}
          {!loanLoading && loan && <LoanPanel loan={loan} />}
          {!loanLoading && !loan && (
            <div className="card">
              <div className="section-title">Loan</div>
              <p className="text-muted text-sm">
                Loan record not yet available. It is created on approval when a valid
                interest rate and term are present.
              </p>
            </div>
          )}
        </>
      )}

      {/* Status history / timeline */}
      <div className="card">
        <div className="section-title">Application Timeline</div>
        {app.status_history.length === 0 ? (
          <p className="text-muted text-sm">No history.</p>
        ) : (
          <div className="timeline">
            {[...app.status_history].reverse().map((h) => (
              <div key={h.id} className="timeline-item">
                <div className="timeline-title">
                  <StatusBadge status={h.new_status} />
                  {h.user_name && (
                    <span className="text-sm text-muted" style={{ marginLeft: ".5rem" }}>
                      by {h.user_name}
                    </span>
                  )}
                </div>
                <div className="timeline-date">{formatDateTime(h.created_at)}</div>
                {h.reason && <div className="timeline-detail">{h.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
