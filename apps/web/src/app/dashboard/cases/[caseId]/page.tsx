"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { RequireAuth } from "@/lib/client/require-auth";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson } from "@/lib/client/api-client";
import { manrope, inter } from "@/lib/client/fonts";
import { ShieldIcon } from "@/lib/client/shield-icon";
import { CornerBracket } from "@/lib/client/corner-bracket";

interface CaseDetail {
  id: string;
  case_number: string;
  case_type: string;
  status: string;
  department: string;
  document_count: number;
  created_at: string;
}

interface DocumentRow {
  id: string;
  title: string;
  doc_type: string;
  source_type: string;
  current_version_id: string | null;
  latest_version_no: number | null;
  latest_status: string | null;
  created_at: string;
}

const CARD_SHADOW = "0 0 0 1px rgba(74,144,196,0.05), 0 0 40px rgba(30,80,160,0.14), 0 16px 40px rgba(0,0,0,0.4)";

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="#60a5fa" strokeWidth="1.6" />
      <path d="M14 3v5h5" stroke="#60a5fa" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyDocsIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="#334155" strokeWidth="1.4" />
      <path d="M14 3v5h5" stroke="#334155" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h4" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CaseStatusPill({ status }: { status: string }) {
  const isOpen = status.toUpperCase() === "OPEN";
  const color = isOpen ? "#34d399" : "#94a3b8";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${isOpen ? "rgba(52,211,153,0.35)" : "rgba(148,163,184,0.35)"}`,
        borderRadius: 999,
        padding: "4px 12px",
        color,
        background: isOpen ? "rgba(52,211,153,0.08)" : "rgba(148,163,184,0.08)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
      {status}
    </span>
  );
}

const DOC_STATUS_COLORS: Record<string, string> = {
  READY: "#34d399",
  PROCESSING: "#fbbf24",
  FAILED: "#f87171",
};

function DocStatusPill({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: "#6b7280", fontSize: 12 }}>—</span>;
  const color = DOC_STATUS_COLORS[status] ?? "#94a3b8";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        color,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

function TypeTag({ type }: { type: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        border: "1px solid rgba(192,132,252,0.3)",
        background: "rgba(192,132,252,0.08)",
        color: "#c084fc",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {type}
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(74,144,196,0.1)" }}>
      <div style={{ fontSize: 10.5, color: "#6b7280", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "#e2e8f0" }}>{children}</div>
    </div>
  );
}

function CaseDetailContent() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const { session, logout } = useAuth();
  const [kase, setKase] = useState<CaseDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiJson<CaseDetail>(`/api/v1/cases/${caseId}`),
      apiJson<{ documents: DocumentRow[] }>(`/api/v1/cases/${caseId}/documents`),
    ])
      .then(([caseBody, docsBody]) => {
        setKase(caseBody);
        setDocuments(docsBody.documents);
      })
      .catch(() => setError("Could not load this case."))
      .finally(() => setLoading(false));
  }, [caseId]);

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
      <style>{`
        .ticket-grid { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
        @media (max-width: 820px) {
          .ticket-grid { grid-template-columns: 1fr; }
        }
        .doc-row:hover { background: rgba(74,144,196,0.06) !important; }
      `}</style>

      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid rgba(74,144,196,0.15)",
          background: "rgba(8,12,20,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "12px 28px",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ShieldIcon size={30} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>DigiVault</div>
              <div style={{ fontSize: 10, color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" }}>
                NCRB Women Safety Division
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                border: "1px solid rgba(74,144,196,0.3)",
                background: "rgba(74,144,196,0.08)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                color: "#7ab4e8",
              }}
            >
              {session?.role}
            </span>
            <button
              onClick={logout}
              style={{ border: "1px solid #1e293b", background: "transparent", color: "#cbd5e1", borderRadius: 4, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 28px 56px" }}>
        <Link href="/dashboard" style={{ color: "#6b7280", fontSize: 12.5, textDecoration: "none" }}>
          ← Case Registry
        </Link>

        {loading && <p style={{ color: "#6b7280", marginTop: 24 }}>Loading case…</p>}
        {error && <p style={{ color: "#f87171", marginTop: 24 }}>{error}</p>}

        {kase && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "relative",
                marginTop: 16,
                marginBottom: 24,
                padding: "22px 24px",
                background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
                border: "1px solid rgba(74,144,196,0.25)",
                borderRadius: 6,
                boxShadow: CARD_SHADOW,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <CornerBracket corner="tl" />
              <CornerBracket corner="br" />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <TypeTag type={kase.case_type} />
                  <CaseStatusPill status={kase.status} />
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 800,
                    fontFamily: "var(--font-display)",
                    letterSpacing: -0.3,
                    color: "#e2e8f0",
                  }}
                >
                  {kase.case_number}
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#6b7280" }}>
                  {kase.department} · Opened {new Date(kase.created_at).toLocaleDateString()} · {kase.document_count} document
                  {kase.document_count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => router.push(`/dashboard/cases/${caseId}/upload`)}
                style={{
                  background: "#1e293b",
                  color: "#cbd5e1",
                  border: "1px solid #4a90c4",
                  borderRadius: 4,
                  padding: "11px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 0 20px rgba(74,144,196,0.18)",
                  flexShrink: 0,
                }}
              >
                + Upload Document
              </button>
            </motion.div>

            <div className="ticket-grid">
              <div
                style={{
                  position: "relative",
                  overflow: "hidden",
                  border: "1px solid rgba(74,144,196,0.2)",
                  borderRadius: 6,
                  background: "linear-gradient(165deg, rgba(15,22,35,0.5) 0%, rgba(8,12,20,0.5) 100%)",
                  boxShadow: CARD_SHADOW,
                }}
              >
                <CornerBracket corner="tl" />
                <CornerBracket corner="tr" />
                <CornerBracket corner="bl" />
                <CornerBracket corner="br" />
                <div
                  style={{
                    padding: "14px 18px",
                    borderBottom: "1px solid rgba(74,144,196,0.12)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: "#6b7280",
                  }}
                >
                  Documents
                </div>

                {documents.length === 0 && (
                  <div style={{ display: "grid", justifyItems: "center", gap: 10, color: "#6b7280", padding: "48px 16px" }}>
                    <EmptyDocsIcon />
                    <span>No documents yet — upload the first one for this case.</span>
                  </div>
                )}

                {documents.map((d) => (
                  <div
                    key={d.id}
                    className="doc-row"
                    onClick={() => d.current_version_id && router.push(`/dashboard/documents/${d.id}/versions/${d.current_version_id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "16px 18px",
                      borderBottom: "1px solid rgba(74,144,196,0.08)",
                      cursor: d.current_version_id ? "pointer" : "default",
                      transition: "background 0.12s",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        background: "rgba(74,144,196,0.1)",
                        border: "1px solid rgba(74,144,196,0.25)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <DocIcon />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <TypeTag type={d.doc_type} />
                        <span style={{ fontSize: 11.5, color: "#6b7280" }}>
                          v{d.latest_version_no ?? "—"} · {new Date(d.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <DocStatusPill status={d.latest_status} />
                    {d.current_version_id && (
                      <span style={{ color: "#4a90c4", fontWeight: 700, fontSize: 12.5, marginLeft: 6 }}>Open →</span>
                    )}
                  </div>
                ))}
              </div>

              <div
                style={{
                  position: "relative",
                  padding: "16px 18px",
                  background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
                  border: "1px solid rgba(74,144,196,0.2)",
                  borderRadius: 6,
                  boxShadow: CARD_SHADOW,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#6b7280", marginBottom: 4 }}>
                  Details
                </div>
                <DetailRow label="Status">
                  <CaseStatusPill status={kase.status} />
                </DetailRow>
                <DetailRow label="Case Type">
                  <TypeTag type={kase.case_type} />
                </DetailRow>
                <DetailRow label="Department">{kase.department}</DetailRow>
                <DetailRow label="Created">{new Date(kase.created_at).toLocaleDateString()}</DetailRow>
                <DetailRow label="Documents">{kase.document_count}</DetailRow>
                <div style={{ paddingTop: 12 }}>
                  <div style={{ fontSize: 10.5, color: "#6b7280", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>
                    Case ID
                  </div>
                  <div style={{ fontSize: 11, fontFamily: "monospace", color: "#4a5568", wordBreak: "break-all" }}>{kase.id}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default function CaseDetailPage() {
  return (
    <RequireAuth>
      <CaseDetailContent />
    </RequireAuth>
  );
}
