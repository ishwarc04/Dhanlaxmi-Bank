import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { applicationsApi, apiError } from "../api";
import type { LoanApplicationListItem } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { formatINR, formatDate } from "../utils";

export function CustomerDashboard() {
  const { user } = useAuth();
  const [apps, setApps] = useState<LoanApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    applicationsApi.list()
      .then(setApps)
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const statusCounts = apps.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.5rem" }}>
        <div>
          <h1>Welcome, {user?.full_name}</h1>
          <p className="text-muted text-sm">Manage your loan applications</p>
        </div>
        <Link to="/applications/new" className="btn btn-accent">
          New Application
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-4" style={{ marginBottom: "1.5rem" }}>
        {[
          { label: "Total", value: apps.length, key: null },
          { label: "Pending", value: (statusCounts.submitted || 0) + (statusCounts.under_review || 0), key: null },
          { label: "Approved", value: statusCounts.approved || 0, key: null },
          { label: "Drafts", value: statusCounts.draft || 0, key: null },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Applications list */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ margin: 0 }}>My Applications</h2>
          <Link to="/applications/new" className="btn btn-outline btn-sm">
            + New
          </Link>
        </div>

        {loading && <Spinner />}
        {error && <div className="alert alert-error">{error}</div>}

        {!loading && !error && apps.length === 0 && (
          <div className="empty-state">
            <h3>No applications yet</h3>
            <p>Start by creating a new loan application.</p>
            <Link to="/applications/new" className="btn btn-accent">
              Create Application
            </Link>
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>{app.loan_purpose ?? "—"}</td>
                    <td>{app.loan_amount != null ? formatINR(app.loan_amount) : "—"}</td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="text-sm text-muted">{formatDate(app.updated_at)}</td>
                    <td>
                      <Link
                        to={`/applications/${app.id}`}
                        className="btn btn-outline btn-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
