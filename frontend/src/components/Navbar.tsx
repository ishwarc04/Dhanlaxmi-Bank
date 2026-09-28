import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useTheme } from "../ThemeContext";

export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="nav" role="navigation" aria-label="Main navigation">
      <div className="container nav-inner">
        <Link to="/" className="nav-brand">FinTrust</Link>

        {user && (
          <div className="nav-links">
            {user.role === "customer" ? (
              <>
                <NavLink to="/dashboard" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  Dashboard
                </NavLink>
                <NavLink to="/applications" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  My Applications
                </NavLink>
                <NavLink to="/calculator" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  EMI Calculator
                </NavLink>
                <NavLink to="/notifications" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  Notifications
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/admin" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  Dashboard
                </NavLink>
                <NavLink to="/admin/applications" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  Applications
                </NavLink>
                <NavLink to="/admin/audit" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
                  Audit Logs
                </NavLink>
              </>
            )}
          </div>
        )}

        <div className="nav-right">
          <button
            className="btn btn-outline btn-sm"
            onClick={toggle}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
          {user ? (
            <>
              <span className="text-sm text-muted" aria-label="Current user">
                {user.full_name}
              </span>
              <button className="btn btn-outline btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline btn-sm">Login</Link>
              <Link to="/register" className="btn btn-accent btn-sm">Register</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
