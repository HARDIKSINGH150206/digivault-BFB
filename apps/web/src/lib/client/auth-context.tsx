"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSession, setSession, clearSession, type Session } from "./auth-storage";
import { apiJson } from "./api-client";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  loginAs: (userId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setSessionState(getSession());
    setLoading(false);
  }, []);

  async function loginAs(userId: string) {
    const body = await apiJson<{ token: string; user_id: string; role: string }>("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    const next: Session = { token: body.token, userId: body.user_id, role: body.role };
    setSession(next);
    setSessionState(next);
  }

  function logout() {
    clearSession();
    setSessionState(null);
    router.push("/login");
  }

  return <AuthContext.Provider value={{ session, loading, loginAs, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
