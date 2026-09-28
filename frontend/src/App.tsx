import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Navbar } from "./components/Navbar";
import { Spinner } from "./components/Spinner";

// Auth pages
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

// Customer pages
import { CustomerDashboard } from "./pages/CustomerDashboard";
import { ApplicationFormPage } from "./pages/ApplicationFormPage";
import { ApplicationDetailPage } from "./pages/ApplicationDetailPage";
import { EMICalculatorPage } from "./pages/EMICalculatorPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";

// Admin pages
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminApplicationsPage } from "./pages/AdminApplicationsPage";
import { AdminApplicationDetailPage } from "./pages/AdminApplicationDetailPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner text="Authenticating..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner text="Authenticating..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner text="Authenticating..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "customer") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner text="Loading..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer routes */}
        <Route
          path="/dashboard"
          element={
            <RequireCustomer>
              <CustomerDashboard />
            </RequireCustomer>
          }
        />
        <Route
          path="/applications"
          element={
            <RequireCustomer>
              <CustomerDashboard />
            </RequireCustomer>
          }
        />
        <Route
          path="/applications/new"
          element={
            <RequireCustomer>
              <ApplicationFormPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/applications/:id/edit"
          element={
            <RequireCustomer>
              <ApplicationFormPage />
            </RequireCustomer>
          }
        />
        <Route
          path="/applications/:id"
          element={
            <RequireAuth>
              <ApplicationDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/calculator"
          element={
            <RequireAuth>
              <EMICalculatorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/applications"
          element={
            <RequireAdmin>
              <AdminApplicationsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/applications/:id"
          element={
            <RequireAdmin>
              <AdminApplicationDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireAdmin>
              <AuditLogsPage />
            </RequireAdmin>
          }
        />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer>
        <div className="container">
          Independent academic prototype — not affiliated with the bank
        </div>
      </footer>
    </>
  );
}
