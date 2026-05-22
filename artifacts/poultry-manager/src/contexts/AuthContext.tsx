import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiPath } from "@/lib/api";

export type UserRole = "admin" | "worker";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const r = await fetch(apiPath("/auth/me"), { credentials: "include" });
      const data = r.ok ? await r.json() : null;
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchMe().finally(() => setLoading(false));
  }, [fetchMe]);

  const login = async (username: string, password: string) => {
    let res: Response;
    try {
      res = await fetch(apiPath("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error("خطأ في الاتصال بالخادم. تحقق من اتصالك بالإنترنت");
    }
    if (!res.ok) {
      let errorMsg = "خطأ في تسجيل الدخول";
      try {
        const data = await res.json();
        errorMsg = data.error ?? errorMsg;
      } catch { /* response not JSON */ }
      throw new Error(errorMsg);
    }
    try {
      const data = await res.json();
      setUser(data);
    } catch {
      throw new Error("خطأ في معالجة بيانات الخادم");
    }
  };

  const logout = async () => {
    try {
      await fetch(apiPath("/auth/logout"), { method: "POST", credentials: "include" });
    } catch { /* ignore network errors on logout */ }
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
