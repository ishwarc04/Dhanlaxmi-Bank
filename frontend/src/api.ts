// FinTrust API client — all communication with FastAPI backend
import axios, { AxiosError } from "axios";
import type {
  User, TokenResponse, LoanApplication, LoanApplicationListItem,
  Assessment, Loan, Notification, DashboardStats, AuditLog,
  EMICalculatorResponse, ModelStatus, Document,
  RegisterPayload, LoginPayload, ApplicationDraftPayload,
  StaffVerificationPayload, DecisionPayload,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: BASE_URL,
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("fintrust_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear token (session expired)
apiClient.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("fintrust_token");
    }
    return Promise.reject(err);
  }
);

/** Extract readable error message from axios error */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data?.detail === "string") return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((d: { msg: string }) => d.msg).join(", ");
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  register: (p: RegisterPayload) =>
    apiClient.post<User>("/api/auth/register", p).then((r) => r.data),

  login: (p: LoginPayload) =>
    apiClient.post<TokenResponse>("/api/auth/login", p).then((r) => r.data),

  me: () => apiClient.get<User>("/api/auth/me").then((r) => r.data),

  updateMe: (p: { full_name?: string; phone?: string }) =>
    apiClient.put<User>("/api/auth/me", p).then((r) => r.data),
};

// ─── Customer Applications ───────────────────────────────────────────────────
export const applicationsApi = {
  list: () =>
    apiClient.get<LoanApplicationListItem[]>("/api/applications/my").then((r) => r.data),

  get: (id: string) =>
    apiClient.get<LoanApplication>(`/api/applications/${id}`).then((r) => r.data),

  create: (p: ApplicationDraftPayload) =>
    apiClient.post<LoanApplication>("/api/applications/", p).then((r) => r.data),

  update: (id: string, p: ApplicationDraftPayload) =>
    apiClient.put<LoanApplication>(`/api/applications/${id}`, p).then((r) => r.data),

  submit: (id: string) =>
    apiClient.post<LoanApplication>(`/api/applications/${id}/submit`).then((r) => r.data),

  respondClarification: (id: string, message: string) =>
    apiClient
      .post<LoanApplication>(`/api/applications/${id}/clarification`, { message })
      .then((r) => r.data),

  uploadDocument: (id: string, file: File, category?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (category) form.append("category", category);
    return apiClient
      .post<Document>(`/api/applications/${id}/documents`, form)
      .then((r) => r.data);
  },

  documentDownloadUrl: (appId: string, docId: string) =>
    `${BASE_URL}/api/applications/${appId}/documents/${docId}/download`,
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: () =>
    apiClient.get<DashboardStats>("/api/admin/dashboard").then((r) => r.data),

  listApplications: (params?: {
    status?: string;
    search?: string;
    purpose?: string;
    page?: number;
    per_page?: number;
  }) =>
    apiClient
      .get<LoanApplicationListItem[]>("/api/admin/applications", { params })
      .then((r) => r.data),

  getApplication: (id: string) =>
    apiClient
      .get<LoanApplication>(`/api/admin/applications/${id}`)
      .then((r) => r.data),

  verify: (id: string, p: StaffVerificationPayload) =>
    apiClient
      .put<LoanApplication>(`/api/admin/applications/${id}/verify`, p)
      .then((r) => r.data),

  assess: (id: string) =>
    apiClient
      .post<Assessment>(`/api/admin/applications/${id}/assess`)
      .then((r) => r.data),

  listAssessments: (id: string) =>
    apiClient
      .get<Assessment[]>(`/api/admin/applications/${id}/assessments`)
      .then((r) => r.data),

  decide: (id: string, p: DecisionPayload) =>
    apiClient
      .post<LoanApplication>(`/api/admin/applications/${id}/decide`, p)
      .then((r) => r.data),

  getLoan: (id: string) =>
    apiClient.get<Loan>(`/api/admin/applications/${id}/loan`).then((r) => r.data),

  auditLogs: (params?: { entity_type?: string; entity_id?: string; page?: number }) =>
    apiClient
      .get<AuditLog[]>("/api/admin/audit-logs", { params })
      .then((r) => r.data),
};

// ─── General ─────────────────────────────────────────────────────────────────
export const generalApi = {
  notifications: (unreadOnly?: boolean) =>
    apiClient
      .get<Notification[]>("/api/notifications", {
        params: unreadOnly ? { unread_only: true } : {},
      })
      .then((r) => r.data),

  markRead: (id: string) =>
    apiClient.put(`/api/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    apiClient.put("/api/notifications/read-all").then((r) => r.data),

  emiCalculator: (principal: number, annual_rate: number, term_months: number) =>
    apiClient
      .post<EMICalculatorResponse>("/api/emi-calculator", {
        principal,
        annual_rate,
        term_months,
      })
      .then((r) => r.data),

  getLoan: (appId: string) =>
    apiClient.get<Loan>(`/api/loans/${appId}`).then((r) => r.data),

  simulatePayment: (appId: string, repaymentId: string) =>
    apiClient
      .post(`/api/loans/${appId}/repayments/${repaymentId}/pay`)
      .then((r) => r.data),

  modelStatus: () =>
    apiClient.get<ModelStatus>("/api/model-status").then((r) => r.data),

  health: () => apiClient.get("/api/health").then((r) => r.data),
};
