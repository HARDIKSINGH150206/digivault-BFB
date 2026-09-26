"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.push("/login");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F6F8FA", color: "#5E5E5E", fontSize: 14 }} role="status">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}
