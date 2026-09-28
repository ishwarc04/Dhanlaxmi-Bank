import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, generalApi, apiError } from "../api";
import type { DashboardStats, ModelStatus } from "../types";
import { Spinner } from "../components/Spinner";
import { formatINR } from "../utils";

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.dashboard(),
      generalApi.modelStatus(),
    ])
      .then(([s, ms]) => { setStats(s); setModelStatus(ms); })
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h1>Admin Dashboard</h1>
          <p className="text-muted text-sm">Dhanlaxmi Bank — Loan Assessment System</p>
        </div>
        <Link to="/admin/applications" className="btn btn-accent">
          Review Applications
        </Link>
      </div>

      {/* Model status */}
      {modelStatus && (
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <div className="section-title">ML Model Status</div>
          {(!modelStatus.approval_available || !modelStatus.isolation_available) && (
            <div className="alert alert-warning" style={{ marginBottom: ".75rem" }}>
              One or more models are unavailable. Manual review workflow is still available.
            </div>
          )}
          <div className="grid grid-2">
            <div className="model-card" style={{ borderColor: modelStatus.approval_available ? "var(--success)" : "var(--danger)" }}>
              <p className="fw-600 text-sm" style={{ marginBottom: ".25rem" }}>Approval Model (XGBoost)</p>
              <p className="text-sm" style={{ color: modelStatus.approval_available ? "var(--success)" : "var(--danger)", marginBottom: 0 }}>
                {modelStatus.approval_available ? "Available" : "UNAVAILABLE"}
              </p>
            </div>
            <div className="model-card" style={{ borderColor: modelStatus.isolation_available ? "var(--success)" : "var(--danger)" }}>
              <p className="fw-600 text-sm" style={{ marginBottom: ".25rem" }}>Anomaly Model (Isolation Forest)</p>
              <p className="text-sm" style={{ color: modelStatus.isolation_available ? "var(--success)" : "var(--danger)", marginBottom: 0 }}>
                {modelStatus.isolation_available ? "Available" : "UNAVAILABLE"}
              </p>
            </div>
          </div>
          {modelStatus.load_errors.length > 0 && (
            <details style={{ marginTop: ".75rem" }}>
              <summary className="text-sm text-muted" style={{ cursor: "pointer" }}>Model load errors ({modelStatus.load_errors.length})</summary>
              <ul style={{ marginTop: ".5rem" }}>
                {modelStatus.load_errors.map((e, i) => <li key={i} className="text-sm text-danger">{e}</li>)}
              </ul>
            </details>
          )}
          <p className="text-sm text-muted" style={{ marginTop: ".5rem", marginBottom: 0 }}>
            Model outputs are advisory only. Human officer makes the final decision.
            These are academic models trained on synthetic data and are not fairness-certified.
          </p>
        </div>
      )}

      {loading && <Spinner />}
      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
            {[
              { label: "Total Applications", value: stats.total_applications },
              { label: "Pending Review", value: stats.pending_review },
              { label: "Approved", value: stats.approved },
              { label: "Rejected", value: stats.rejected },
              { label: "Needs Info", value: stats.needs_info },
              { label: "Drafts", value: stats.drafts },
              { label: "Total Disbursed", value: formatINR(stats.total_disbursed) },
              { label: "Avg. Loan Amount", value: formatINR(stats.avg_loan_amount) },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="card">
            <div className="section-title">Quick Access</div>
            <div className="flex gap-md" style={{ flexWrap: "wrap" }}>
              <Link to="/admin/applications?status=submitted" className="btn btn-outline">
                Submitted ({stats.pending_review})
              </Link>
              <Link to="/admin/applications?status=under_review" className="btn btn-outline">
                Under Review
              </Link>
              <Link to="/admin/applications?status=needs_information" className="btn btn-outline">
                Needs Info ({stats.needs_info})
              </Link>
              <Link to="/admin/audit" className="btn btn-outline">Audit Logs</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
