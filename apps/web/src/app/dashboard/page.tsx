"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { useAuth } from "@/lib/client/auth-context";
import { WorkspaceDashboard } from "./workspace-dashboard";
import { InvestigationDashboard } from "./_workspace/investigation-dashboard";

// Roles that run investigations (anchor retries, share links) get the
// case-centric dashboard; everyone else gets the evidence dashboard.
function DashboardForRole() {
  const { session } = useAuth();
  const role = session?.role;
  return role === "INVESTIGATING_OFFICER" || role === "ADMIN" ? <InvestigationDashboard /> : <WorkspaceDashboard />;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardForRole />
    </RequireAuth>
  );
}
