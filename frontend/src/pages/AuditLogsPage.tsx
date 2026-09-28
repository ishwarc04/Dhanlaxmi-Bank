import { useEffect, useState } from "react";
import { adminApi, apiError } from "../api";
import type { AuditLog } from "../types";
import { Spinner } from "../components/Spinner";
import { formatDateTime } from "../utils";

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  const load = () => {
    setLoading(true);
    adminApi
      .auditLogs({
        entity_type: entityType || undefined,
        entity_id: entityId || undefined,
      })
      .then(setLogs)
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="container page">
      <h1 style={{ marginBottom: "1.25rem" }}>Audit Logs</h1>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="grid grid-3" style={{ gap: ".75rem", alignItems: "end" }}>
          <div>
            <label className="form-label" htmlFor="entityType">Entity Type</label>
            <select
              id="entityType"
              className="form-select"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">All</option>
              <option value="user">User</option>
              <option value="application">Application</option>
              <option value="document">Document</option>
              <option value="assessment">Assessment</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="entityId">Entity ID</label>
            <input
              id="entityId"
              type="text"
              className="form-input"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="UUID..."
            />
          </div>
          <div>
            <button className="btn btn-accent" onClick={load}>Filter</button>
          </div>
        </div>
      </div>

      {loading && <Spinner />}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && logs.length === 0 && (
        <div className="empty-state">
          <h3>No audit logs found</h3>
          <p>Adjust the filters or wait for activity.</p>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm text-muted" style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="text-sm">{log.user_name ?? "System"}</td>
                    <td>
                      <code style={{ fontSize: ".8rem" }}>{log.action}</code>
                    </td>
                    <td className="text-sm text-muted">
                      {log.entity_type && (
                        <span>
                          {log.entity_type}
                          {log.entity_id && (
                            <span style={{ fontFamily: "monospace", fontSize: ".7rem", display: "block" }}>
                              {log.entity_id.slice(0, 8)}…
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-muted" style={{ maxWidth: 200 }}>
                      {log.details ? (
                        <details>
                          <summary style={{ cursor: "pointer" }}>view</summary>
                          <pre style={{ fontSize: ".75rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : "—"}
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
