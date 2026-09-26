"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/lib/client/require-auth";
import { WorkspaceUploadView } from "../../../_workspace/upload-view";

export default function UploadPage() {
  return (
    <RequireAuth>
      {/* The upload view reads ?document= (new version of an existing document). */}
      <Suspense>
        <WorkspaceUploadView />
      </Suspense>
    </RequireAuth>
  );
}
