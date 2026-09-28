import { useEffect, useState } from "react";
import { generalApi, apiError } from "../api";
import type { Notification } from "../types";
import { Spinner } from "../components/Spinner";
import { formatDateTime } from "../utils";

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    generalApi.notifications()
      .then(setItems)
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const markAllRead = async () => {
    await generalApi.markAllRead();
    reload();
  };

  const markRead = async (id: string) => {
    await generalApi.markRead(id);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  return (
    <div className="container page">
      <div className="flex-between" style={{ marginBottom: "1.25rem" }}>
        <h1>Notifications</h1>
        <button className="btn btn-outline btn-sm" onClick={markAllRead}>
          Mark all read
        </button>
      </div>

      {loading && <Spinner />}
      {error && <div className="alert alert-error">{error}</div>}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          <h3>No notifications</h3>
          <p>You're all caught up.</p>
        </div>
      )}

      {items.map((n) => (
        <div
          key={n.id}
          className="card"
          style={{ marginBottom: ".5rem", opacity: n.is_read ? 0.7 : 1 }}
        >
          <div className="flex-between">
            <div>
              <p className="fw-600" style={{ marginBottom: ".2rem" }}>{n.title}</p>
              <p className="text-sm" style={{ marginBottom: ".25rem" }}>{n.message}</p>
              <p className="text-sm text-muted">{formatDateTime(n.created_at)}</p>
            </div>
            {!n.is_read && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => markRead(n.id)}
              >
                Mark read
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
