import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { applicationsApi, generalApi, apiError } from "../api";
import type { LoanApplication, Loan } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { formatINR, formatDateTime } from "../utils";

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<LoanApplication | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clarification, setClarification] = useState("");
  const [clarifError, setClarifError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docCategory, setDocCategory] = useState("identity");
  const [paymentMsg, setPaymentMsg] = useState<string | null>(null);

  const reload = () => {
    if (!id) return;
    setLoading(true);
    applicationsApi.get(id)
      .then((a) => {
        setApp(a);
        if (a.status === "approved") {
          return generalApi.getLoan(id).then(setLoan).catch(() => null);
        }
      })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [id]);

  const handleSubmit = async () => {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await applicationsApi.submit(id);
      setApp(updated);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleClarification = async () => {
    if (!id || !clarification.trim()) { setClarifError("Please enter a message"); return; }
    setSubmitting(true);
    setClarifError(null);
    try {
      const updated = await applicationsApi.respondClarification(id, clarification);
      setApp(updated);
      setClarification("");
    } catch (e) {
      setClarifError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    setUploadError(null);
    try {
      await applicationsApi.uploadDocument(id, file, docCategory);
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) {
      setUploadError(apiError(e));
    } finally {
      setUploading(false);
    }
  };

  const handlePayment = async (repaymentId: string) => {
    if (!id) return;
    setPaymentMsg(null);
    try {
      await generalApi.simulatePayment(id, repaymentId);
      setPaymentMsg("Simulated payment recorded successfully.");
      reload();
    } catch (e) {
      setPaymentMsg(apiError(e));
    }
  };

  if (loading) return <div className="container page"><Spinner /></div>;
  if (error && !app) return <div className="container page"><div className="alert alert-error">{error}</div></div>;
  if (!app) return null;

  const canEdit = app.status === "draft";
  const canSubmit = app.status === "draft";
  const needsInfo = app.status === "needs_information";

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h1>Application</h1>
          <p className="text-muted text-sm" style={{ fontFamily: "monospace" }}>{app.id}</p>
        </div>
        <div className="flex gap-sm">
          {canEdit && (
            <Link to={`/applications/${app.id}/edit`} className="btn btn-outline btn-sm">
              Edit Draft
            </Link>
          )}
          {canSubmit && (
            <button
              className="btn btn-accent"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Status & Decision */}
      <div className="card">
        <div className="flex gap-sm" style={{ alignItems: "center", marginBottom: ".75rem" }}>
          <StatusBadge status={app.status} />
          <span className="text-sm text-muted">Updated {formatDateTime(app.updated_at)}</span>
        </div>
        {app.decision_reason && (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            <strong>Officer note:</strong> {app.decision_reason}
          </div>
        )}
      </div>

      {/* Clarification response */}
      {needsInfo && (
        <div className="card" style={{ borderColor: "var(--warning)" }}>
          <div className="section-title" style={{ color: "var(--warning)" }}>Additional Information Required</div>
          <p className="text-sm" style={{ marginBottom: ".75rem" }}>
            The loan officer has requested additional information. Please provide your response below.
          </p>
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="Your response..."
            value={clarification}
            onChange={(e) => setClarification(e.target.value)}
          />
          {clarifError && <p className="form-error">{clarifError}</p>}
          <div className="flex-end mt-1">
            <button className="btn btn-accent" onClick={handleClarification} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Response"}
            </button>
          </div>
        </div>
      )}

      {/* Application Details */}
      <div className="card">
        <div className="section-title">Loan Details</div>
        <div className="grid grid-3">
          {[
            ["Purpose", app.loan_purpose],
            ["Amount", app.loan_amount != null ? formatINR(app.loan_amount) : null],
            ["Term", app.loan_term != null ? `${app.loan_term} months` : null],
            ["Applicant Income", app.applicant_income != null ? `${formatINR(app.applicant_income)}/mo` : null],
            ["Co-applicant Income", app.coapplicant_income != null ? `${formatINR(app.coapplicant_income)}/mo` : null],
            ["Proposed EMI", app.proposed_monthly_emi != null ? `${formatINR(app.proposed_monthly_emi)}/mo` : null],
            ["DTI Ratio", app.dti_ratio != null ? `${(app.dti_ratio * 100).toFixed(1)}%` : null],
            ["Interest Rate", app.quoted_interest_rate != null ? `${app.quoted_interest_rate}% p.a.` : null],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="stat-label">{label}</div>
              <div className="fw-600">{value ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents */}
      <div className="card">
        <div className="section-title">Documents</div>
        {app.documents.length === 0 && <p className="text-muted text-sm">No documents uploaded.</p>}
        {app.documents.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Download</th>
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

        {/* Upload */}
        <div style={{ marginTop: ".5rem", padding: ".75rem", background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <p className="text-sm fw-600" style={{ marginBottom: ".5rem" }}>Upload Document</p>
          <div className="grid grid-3" style={{ gap: ".5rem", alignItems: "end" }}>
            <div>
              <label className="form-label" htmlFor="docCategory">Category</label>
              <select
                id="docCategory"
                className="form-select"
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
              >
                {["identity", "income_proof", "bank_statement", "collateral", "other"].map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="fileInput">File (PDF/image, max 10MB)</label>
              <input
                id="fileInput"
                type="file"
                ref={fileRef}
                className="form-input"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              />
            </div>
            <div>
              <button className="btn btn-outline" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
          {uploadError && <p className="form-error">{uploadError}</p>}
        </div>
      </div>

      {/* Status Timeline */}
      <div className="card">
        <div className="section-title">Application Timeline</div>
        {app.status_history.length === 0 && <p className="text-muted text-sm">No history.</p>}
        <div className="timeline">
          {[...app.status_history].reverse().map((h) => (
            <div key={h.id} className="timeline-item">
              <div className="timeline-title">
                <StatusBadge status={h.new_status} />
                {h.user_name && <span className="text-sm text-muted" style={{ marginLeft: ".5rem" }}>by {h.user_name}</span>}
              </div>
              <div className="timeline-date">{formatDateTime(h.created_at)}</div>
              {h.reason && <div className="timeline-detail">{h.reason}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Loan & Repayment (approved) */}
      {app.status === "approved" && loan && (
        <div className="card">
          <div className="section-title">Approved Loan — Simulated</div>
          <div className="alert alert-warning" style={{ marginBottom: "1rem" }}>
            This is a simulated loan record for academic purposes. No real money is disbursed.
          </div>
          <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
            {[
              ["Principal", formatINR(loan.principal_amount)],
              ["Interest Rate", `${loan.interest_rate}% p.a.`],
              ["Term", `${loan.term_months} months`],
              ["Monthly EMI", formatINR(loan.monthly_emi)],
              ["Total Payable", formatINR(loan.total_payable)],
            ].map(([l, v]) => (
              <div key={l as string}>
                <div className="stat-label">{l}</div>
                <div className="fw-600">{v}</div>
              </div>
            ))}
          </div>
          {paymentMsg && <div className="alert alert-info">{paymentMsg}</div>}
          <div className="section-title" style={{ marginTop: "1rem" }}>Repayment Schedule</div>
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
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loan.repayments.slice(0, 24).map((r) => (
                  <tr key={r.id}>
                    <td>{r.installment_number}</td>
                    <td className="text-sm">{new Date(r.due_date).toLocaleDateString("en-IN")}</td>
                    <td>{formatINR(r.emi_amount)}</td>
                    <td className="text-sm">{formatINR(r.principal_component)}</td>
                    <td className="text-sm">{formatINR(r.interest_component)}</td>
                    <td className="text-sm">{formatINR(r.outstanding_balance)}</td>
                    <td>
                      <span className={r.is_paid ? "badge badge-approved" : "badge badge-draft"}>
                        {r.is_paid ? "Paid" : "Due"}
                      </span>
                    </td>
                    <td>
                      {!r.is_paid && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handlePayment(r.id)}
                        >
                          Simulate Pay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loan.repayments.length > 24 && (
              <p className="text-sm text-muted" style={{ padding: ".5rem .9rem" }}>
                Showing first 24 of {loan.repayments.length} installments.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
