"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { WorkspaceVersionView } from "../../../../_workspace/version-view";

export default function VersionDetailPage() {
  return (
    <RequireAuth>
      <WorkspaceVersionView />
    </RequireAuth>
  );
}
