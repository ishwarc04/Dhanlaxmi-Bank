import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi, apiError } from "../api";
import type { LoanApplicationListItem } from "../types";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { formatINR, formatDate } from "../utils";

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "needs_information", label: "Needs Info" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "draft", label: "Draft" },
];

const PURPOSES = [
  { value: "", label: "All Purposes" },
  { value: "Home", label: "Home" },
  { value: "Car", label: "Car" },
  { value: "Business", label: "Business" },
  { value: "Education", label: "Education" },
  { value: "Personal", label: "Personal" },
];

export function AdminApplicationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState<LoanApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const purpose = searchParams.get("purpose") ?? "";

  const [searchInput, setSearchInput] = useState(search);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .listApplications({
        status: status || undefined,
        search: search || undefined,
        purpose: purpose || undefined,
      })
      .then(setApps)
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [status, search, purpose]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  };

  const handleSearch = () => {
    setFilter("search", searchInput);
  };

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
        <h1>Applications</h1>
        <span className="text-muted text-sm">{apps.length} result{apps.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="grid grid-4" style={{ gap: ".75rem", alignItems: "end" }}>
          <div>
            <label className="form-label" htmlFor="statusFilter">Status</label>
            <select
              id="statusFilter"
              className="form-select"
              value={status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="purposeFilter">Purpose</label>
            <select
              id="purposeFilter"
              className="form-select"
              value={purpose}
              onChange={(e) => setFilter("purpose", e.target.value)}
            >
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="searchInput">Search (name / email / ID)</label>
            <input
              id="searchInput"
              type="text"
              className="form-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search..."
            />
          </div>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button className="btn btn-accent" onClick={handleSearch}>Search</button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setSearchInput("");
                setSearchParams({});
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && apps.length === 0 && (
        <div className="empty-state">
          <h3>No applications found</h3>
          <p>Try adjusting the filters.</p>
        </div>
      )}

      {!loading && apps.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Purpose</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div className="fw-600 text-sm">{app.applicant_name ?? "—"}</div>
                      <div className="text-sm text-muted" style={{ fontFamily: "monospace", fontSize: ".7rem" }}>
                        {app.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td>{app.loan_purpose ?? "—"}</td>
                    <td>{app.loan_amount != null ? formatINR(app.loan_amount) : "—"}</td>
                    <td><StatusBadge status={app.status} /></td>
                    <td className="text-sm text-muted">{formatDate(app.created_at)}</td>
                    <td>
                      <Link
                        to={`/admin/applications/${app.id}`}
                        className="btn btn-outline btn-sm"
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
