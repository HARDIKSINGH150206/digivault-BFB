"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { WorkspaceAuditView } from "../_workspace/audit-view";

export default function AuditPage() {
  return (
    <RequireAuth>
      <WorkspaceAuditView />
    </RequireAuth>
  );
}
