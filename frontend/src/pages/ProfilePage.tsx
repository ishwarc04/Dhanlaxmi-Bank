import { useState, FormEvent } from "react";
import { useAuth } from "../auth";
import { authApi, apiError } from "../api";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [full_name, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await authApi.updateMe({ full_name, phone: phone || undefined });
      await refreshUser();
      setSuccess(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container page">
      <h1 style={{ marginBottom: ".25rem" }}>Profile</h1>
      <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
        {user?.email} &mdash; {user?.role === "admin" ? "Admin" : "Customer"}
      </p>

      {success && (
        <div className="alert alert-success" role="status">
          Profile updated successfully.
        </div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={user?.email ?? ""}
              disabled
              aria-readonly="true"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="full_name">
              Full Name <span className="required">*</span>
            </label>
            <input
              id="full_name"
              type="text"
              className="form-input"
              value={full_name}
              onChange={(e) => setFullName(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex-end">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
