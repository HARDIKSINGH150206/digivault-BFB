"use client";

import "@/lib/client/buffer-polyfill";
import "@/lib/client/pdf-worker-setup";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/lib/client/require-auth";
import { apiFetch } from "@/lib/client/api-client";
import { hashDocument, DEFAULT_GRID_SIZE, type DocumentHashResult } from "@digivault/crypto-core";
import { manrope, inter } from "@/lib/client/fonts";
import { ShieldIcon } from "@/lib/client/shield-icon";
import { CornerBracket } from "@/lib/client/corner-bracket";
import { FileUpload } from "@/lib/client/file-upload";

type Phase = "idle" | "hashing" | "uploading" | "done" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  hashing: "Rendering pages, computing hashes and Merkle tree in your browser…",
  uploading: "Uploading — server is re-verifying hashes and waiting on AI redaction suggestions, this can take a few seconds…",
  done: "Uploaded.",
  error: "Upload failed.",
};

const CARD_SHADOW = "0 0 0 1px rgba(74,144,196,0.05), 0 0 40px rgba(30,80,160,0.14), 0 16px 40px rgba(0,0,0,0.4)";

const TEXT_INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0a0f1a",
  color: "#e2e8f0",
  border: "1px solid #1e3a5f",
  borderRadius: 4,
  padding: "10px 12px",
  fontSize: 13.5,
  fontFamily: "var(--font-body)",
};

function UploadContent() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("FIR");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [clientResult, setClientResult] = useState<DocumentHashResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);

    try {
      setPhase("hashing");
      const pdfBytes = await file.arrayBuffer();
      const result = await hashDocument(pdfBytes, { gridSize: DEFAULT_GRID_SIZE });
      setClientResult(result);

      setPhase("uploading");
      const metadata = {
        case_id: caseId,
        document_id: null,
        title,
        doc_type: docType,
        source_type: "NATIVE_PDF",
        grid_size: result.gridSize,
        page_count: result.pageCount,
        client_hash: result.clientHash,
        merkle_root: result.merkleRoot,
        tiles: result.tiles.map((t) => ({
          tile_index: t.index,
          page_index: t.pageIndex,
          row: t.row,
          col: t.col,
          hash: t.hashHex,
        })),
        pages: result.pages.map((p) => ({
          page_index: p.pageIndex,
          width_px: p.widthPx,
          height_px: p.heightPx,
        })),
      };

      const form = new FormData();
      form.set("metadata", JSON.stringify(metadata));
      result.pagePngBytes.forEach((bytes, i) => {
        const copy = bytes.slice().buffer;
        form.set(`page_${i}`, new Blob([copy], { type: "image/png" }), `page-${i}.png`);
      });

      const res = await apiFetch("/api/v1/evidence/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Upload failed (${res.status})`);

      setPhase("done");
      router.push(`/dashboard/documents/${body.document_id}/versions/${body.document_version_id}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = phase === "hashing" || phase === "uploading";

  return (
    <main
      className={`${inter.variable} ${manrope.variable} ${inter.className}`}
      style={{
        minHeight: "100vh",
        color: "#e2e8f0",
        backgroundColor: "#040508",
        backgroundImage: [
          "linear-gradient(rgba(30,60,100,0.12) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(30,60,100,0.12) 1px, transparent 1px)",
          "radial-gradient(ellipse at top, rgba(20,50,100,0.25) 0%, transparent 55%)",
        ].join(","),
        backgroundSize: "40px 40px, 40px 40px, 100% 100%",
      }}
    >
      <nav
        style={{
          borderBottom: "1px solid rgba(74,144,196,0.15)",
          background: "rgba(8,12,20,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "12px 28px",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <ShieldIcon size={30} />
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)" }}>DigiVault</div>
        </div>
      </nav>

      <section style={{ maxWidth: 720, margin: "0 auto", padding: "28px 28px 56px" }}>
        <Link href={`/dashboard/cases/${caseId}`} style={{ color: "#6b7280", fontSize: 12.5, textDecoration: "none" }}>
          ← Back to case
        </Link>

        <h1 style={{ margin: "16px 0 4px", fontSize: 24, fontWeight: 800, fontFamily: "var(--font-display)" }}>
          Upload Document
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6b7280" }}>
          Hashing and the Merkle tree are computed in your browser before anything is sent — the server independently
          re-verifies them on arrival.
        </p>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              position: "relative",
              padding: 20,
              background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
              border: "1px solid rgba(74,144,196,0.25)",
              borderRadius: 6,
              boxShadow: CARD_SHADOW,
              display: "grid",
              gap: 14,
            }}
          >
            <CornerBracket corner="tl" />
            <CornerBracket corner="br" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#9ca3af", marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  Document title
                </label>
                <input
                  placeholder="e.g. FIR Report"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  style={TEXT_INPUT_STYLE}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: "#9ca3af", marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  Document type
                </label>
                <input
                  placeholder="e.g. FIR"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  required
                  style={TEXT_INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 11, color: "#9ca3af", marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" }}>
                PDF file
              </label>
              <FileUpload
                accept={{ "application/pdf": [".pdf"] }}
                title="Upload evidence PDF"
                description="Drag or drop the document here, or click to browse"
                onChange={(files) => setFile(files[0] ?? null)}
              />
            </div>

            <button
              type="submit"
              disabled={busy || !file}
              style={{
                background: "#1e293b",
                color: "#cbd5e1",
                border: "1px solid #4a90c4",
                borderRadius: 4,
                padding: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: busy || !file ? "not-allowed" : "pointer",
                opacity: busy || !file ? 0.55 : 1,
                boxShadow: busy || !file ? "none" : "0 0 20px rgba(74,144,196,0.18)",
              }}
            >
              {busy ? "Working…" : "Upload"}
            </button>
          </div>
        </form>

        {phase !== "idle" && (
          <p style={{ marginTop: 16, fontSize: 13, color: phase === "error" ? "#f87171" : "#9ca3af" }}>{PHASE_LABEL[phase]}</p>
        )}

        {clientResult && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "rgba(74,144,196,0.06)",
              border: "1px solid rgba(74,144,196,0.2)",
              borderRadius: 4,
              fontSize: 11.5,
              fontFamily: "monospace",
              color: "#7ab4e8",
              wordBreak: "break-all",
            }}
          >
            client merkle_root: {clientResult.merkleRoot.slice(0, 24)}… ({clientResult.tiles.length} tiles,{" "}
            {clientResult.pageCount} page{clientResult.pageCount === 1 ? "" : "s"})
          </div>
        )}

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, marginTop: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 4 }}>
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

export default function UploadPage() {
  return (
    <RequireAuth>
      <UploadContent />
    </RequireAuth>
  );
}
