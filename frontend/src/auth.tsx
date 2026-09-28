// Auth context — manages current user state and token storage
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { User, LoginPayload, RegisterPayload } from "./types";
import { authApi, apiError } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (p: LoginPayload) => Promise<void>;
  register: (p: RegisterPayload) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("fintrust_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      localStorage.removeItem("fintrust_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (p: LoginPayload) => {
    setError(null);
    try {
      const tok = await authApi.login(p);
      localStorage.setItem("fintrust_token", tok.access_token);
      const u = await authApi.me();
      setUser(u);
    } catch (e) {
      setError(apiError(e));
      throw e;
    }
  };

  const register = async (p: RegisterPayload) => {
    setError(null);
    try {
      await authApi.register(p);
      await login({ email: p.email, password: p.password });
    } catch (e) {
      setError(apiError(e));
      throw e;
    }
  };

  const logout = () => {
    localStorage.removeItem("fintrust_token");
    setUser(null);
  };

  const clearError = () => setError(null);

  const refreshUser = async () => {
    const u = await authApi.me();
    setUser(u);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout, clearError, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
