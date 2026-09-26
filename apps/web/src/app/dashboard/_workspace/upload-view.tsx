"use client";

/**
 * Upload page. Roles the upload API rejects see a notice instead of the form.
 *   @digivault/crypto-core hashDocument() in the browser (PDF -> PNG pages -> tile hashes -> Merkle root)
 *   POST /api/v1/evidence/upload (multipart: metadata + page_N PNGs) — the server recomputes and verifies
 *   GET  /api/v1/cases/{caseId} for the page heading
 * With ?document={id} this uploads a new version of that document: metadata
 * carries document_id and the server chains it to the latest version.
 *   GET  /api/v1/cases/{caseId}/documents to name the document being versioned
 */

import "@/lib/client/buffer-polyfill";
import "@/lib/client/pdf-worker-setup";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { hashDocument, DEFAULT_GRID_SIZE } from "@digivault/crypto-core";
import { useAuth } from "@/lib/client/auth-context";
import { apiFetch, apiJson } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { WorkspaceShell, Icon } from "./shell";
import type { CaseRow, DocumentRow } from "./data";

type Phase = "idle" | "hashing" | "uploading" | "error";

const UPLOAD_CSS = `
.ws-upload { max-width: 760px; }
.ws-drop { margin-top: 6px; display: grid; justify-items: center; gap: 8px; padding: 36px 20px; border: 1.5px dashed #C3CDD7; border-radius: 12px;
  background: #FBFCFD; text-align: center; cursor: pointer; transition: border-color 120ms ease, background-color 120ms ease; }
.ws-drop:hover, .ws-drop-active { border-color: #0A66C2; background: #F4F8FC; }
.ws-drop:focus-visible { outline: 2px solid #0A66C2; outline-offset: 2px; }
.ws-drop-icon { width: 48px; height: 48px; border-radius: 12px; background: #EAF2FB; color: #0A66C2; display: grid; place-items: center; }
.ws-drop-title { font-size: 15.5px; font-weight: 600; color: #1D2226; }
.ws-drop-sub { font-size: 13.5px; color: #5E5E5E; }
.ws-file { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding: 12px 14px; border: 1px solid #E3E8ED; border-radius: 10px; background: #FFFFFF; font-size: 14px; }
.ws-upload-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.ws-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #D0D7DE; border-top-color: #0A66C2; animation: ws-spin 800ms linear infinite; flex: none; }
@keyframes ws-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ws-spinner { animation: none; } }
`;

export function WorkspaceUploadView() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const allowed = can(session?.role, "uploadEvidence");
  const documentId = useSearchParams().get("document");

  const [kase, setKase] = useState<CaseRow | null>(null);
  const [existing, setExisting] = useState<DocumentRow | null>(null);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("FIR");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<CaseRow>(`/api/v1/cases/${caseId}`).then(setKase).catch(() => setKase(null));
  }, [caseId]);

  useEffect(() => {
    if (!documentId) return;
    apiJson<{ documents: DocumentRow[] }>(`/api/v1/cases/${caseId}/documents`)
      .then(({ documents }) => {
        const doc = documents.find((d) => d.id === documentId);
        if (doc) setExisting(doc);
        else setExistingError("This document is not part of this case.");
      })
      .catch((err) => setExistingError(err instanceof Error ? err.message : String(err)));
  }, [caseId, documentId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { "application/pdf": [".pdf"] },
    disabled: phase === "hashing" || phase === "uploading",
    onDrop: (files) => setFile(files[0] ?? null),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || (documentId && !existing)) return;
    setError(null);
    try {
      setPhase("hashing");
      const result = await hashDocument(await file.arrayBuffer(), { gridSize: DEFAULT_GRID_SIZE });

      setPhase("uploading");
      const metadata = {
        case_id: caseId,
        document_id: existing ? existing.id : null,
        title: existing ? existing.title : title,
        doc_type: existing ? existing.doc_type : docType,
        source_type: "NATIVE_PDF",
        grid_size: result.gridSize,
        page_count: result.pageCount,
        client_hash: result.clientHash,
        merkle_root: result.merkleRoot,
        tiles: result.tiles.map((t) => ({ tile_index: t.index, page_index: t.pageIndex, row: t.row, col: t.col, hash: t.hashHex })),
        pages: result.pages.map((p) => ({ page_index: p.pageIndex, width_px: p.widthPx, height_px: p.heightPx })),
      };
      const form = new FormData();
      form.set("metadata", JSON.stringify(metadata));
      result.pagePngBytes.forEach((bytes, i) => {
        form.set(`page_${i}`, new Blob([bytes.slice().buffer], { type: "image/png" }), `page-${i}.png`);
      });

      const res = await apiFetch("/api/v1/evidence/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Upload failed (${res.status})`);
      router.push(`/dashboard/documents/${body.document_id}/versions/${body.document_version_id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = phase === "hashing" || phase === "uploading";

  return (
    <WorkspaceShell active="cases" extraCss={UPLOAD_CSS}>
      <Link href={`/dashboard/cases/${caseId}`} className="ws-crumb">
        <Icon name="back" size={18} /> {kase ? kase.case_number : "Back to case"}
      </Link>
      <div className="ws-upload">
        <h1 className="ws-title">{documentId ? "Upload new version" : "Upload document"}</h1>
        <p className="ws-subtitle">Pages are fingerprinted in your browser, then checked again by the server.</p>

        {documentId && existing && (
          <p className="ws-note">
            <Icon name="version" size={18} />
            <span>
              This becomes version {(existing.latest_version_no ?? 0) + 1} of <strong>{existing.title}</strong>, chained to version {existing.latest_version_no}. Earlier versions stay unchanged.
            </span>
          </p>
        )}
        {existingError && <p className="ws-alert" role="alert">{existingError}</p>}

        {!allowed ? (
          <p className="ws-note" role="status">
            <Icon name="info" size={18} /> Your role cannot upload documents.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="ws-panel ws-panel-pad" style={{ marginTop: 24, display: "grid", gap: 18 }}>
            {!documentId && (
              <div className="ws-upload-grid">
                <label className="ws-field">
                  Document title
                  <input className="ws-input" required placeholder="e.g. FIR report" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
                </label>
                <label className="ws-field">
                  Document type
                  <input className="ws-input" required value={docType} onChange={(e) => setDocType(e.target.value)} disabled={busy} />
                </label>
              </div>
            )}

            <div className="ws-field">
              PDF file
              <div {...getRootProps({ className: `ws-drop${isDragActive ? " ws-drop-active" : ""}` })}>
                <input {...getInputProps()} aria-label="Choose a PDF file" />
                <span className="ws-drop-icon"><Icon name="upload" /></span>
                <span className="ws-drop-title">Drop the PDF here, or click to choose a file</span>
                <span className="ws-drop-sub">PDF only</span>
              </div>
              {file && (
                <div className="ws-file">
                  <Icon name="file" size={20} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                  <span className="ws-muted">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button type="submit" className="ws-primary" disabled={busy || !file || Boolean(documentId && !existing)}>
                {busy ? "Working…" : "Upload"}
              </button>
              {busy && (
                <span className="ws-muted" role="status" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span className="ws-spinner" aria-hidden="true" />
                  {phase === "hashing" ? "Rendering pages and computing fingerprints in your browser…" : "Uploading. The server is re-checking every fingerprint…"}
                </span>
              )}
            </div>
            {error && <p className="ws-alert" role="alert" style={{ margin: 0 }}>{error}</p>}
          </form>
        )}
      </div>
    </WorkspaceShell>
  );
}
