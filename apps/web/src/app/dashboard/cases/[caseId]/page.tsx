"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { WorkspaceCaseView } from "../../_workspace/case-view";

export default function CaseDetailPage() {
  return (
    <RequireAuth>
      <WorkspaceCaseView />
    </RequireAuth>
  );
}
