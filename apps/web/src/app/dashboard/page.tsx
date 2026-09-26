"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { RequireAuth } from "@/lib/client/require-auth";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson } from "@/lib/client/api-client";
import { manrope, inter } from "@/lib/client/fonts";
import { ShieldIcon } from "@/lib/client/shield-icon";
import { CornerBracket } from "@/lib/client/corner-bracket";

interface CaseRow {
  id: string;
  case_number: string;
  case_type: string;
  status: string;
  department: string;
  document_count: number;
  created_at: string;
}

function CaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5a2 2 0 0 1 2-2h6l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="#4a90c4" strokeWidth="1.6" />
      <path d="M12 3v4h4" stroke="#4a90c4" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="#60a5fa" strokeWidth="1.6" />
      <path d="M9 12h6M9 16h6M9 8h2" stroke="#60a5fa" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#34d399" strokeWidth="1.6" />
      <path d="M12 7v5l3 3" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 21V7l8-4 8 4v14" stroke="#c084fc" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke="#c084fc" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="#6b7280" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5a2 2 0 0 1 2-2h6l4 4v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" stroke="#334155" strokeWidth="1.4" />
      <path d="M12 3v4h4" stroke="#334155" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h4" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const CARD_SHADOW = "0 0 0 1px rgba(74,144,196,0.05), 0 0 40px rgba(30,80,160,0.14), 0 16px 40px rgba(0,0,0,0.4)";

function StatCard({
  icon,
  label,
  value,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
      whileHover={{ y: -3 }}
      style={{
        position: "relative",
        background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
        border: "1px solid rgba(74, 144, 196, 0.2)",
        borderRadius: 6,
        boxShadow: CARD_SHADOW,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "default",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "10%",
          right: "10%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.7), transparent)",
        }}
      />
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          background: "linear-gradient(165deg, rgba(74,144,196,0.16), rgba(74,144,196,0.04))",
          border: "1px solid rgba(74,144,196,0.25)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 23, fontWeight: 800, color: "#e2e8f0", fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 }}>
          {label}
        </div>
      </div>
    </motion.div>
  );
}

function StatusPill({ status }: { status: string }) {
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
        padding: "3px 10px",
        color,
        background: isOpen ? "rgba(52,211,153,0.08)" : "rgba(148,163,184,0.08)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
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
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {type}
    </span>
  );
}

const TEXT_INPUT_STYLE: React.CSSProperties = {
  background: "#0a0f1a",
  color: "#e2e8f0",
  border: "1px solid #1e3a5f",
  borderRadius: 4,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "var(--font-body)",
};

function DashboardContent() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ case_number: "", case_type: "FIR", department: "Women Safety Division" });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function loadCases() {
    const body = await apiJson<{ cases: CaseRow[] }>("/api/v1/cases");
    setCases(body.cases);
  }

  useEffect(() => {
    loadCases()
      .catch(() => setError("Could not load cases."))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiJson("/api/v1/cases", { method: "POST", body: JSON.stringify(form) });
      setShowForm(false);
      setForm({ case_number: "", case_type: "FIR", department: "Women Safety Division" });
      await loadCases();
    } catch {
      setError("Could not create case — check the case number is unique.");
    }
  }

  const stats = useMemo(() => {
    const totalDocuments = cases.reduce((sum, c) => sum + c.document_count, 0);
    const openCases = cases.filter((c) => c.status.toUpperCase() === "OPEN").length;
    const departments = new Set(cases.map((c) => c.department)).size;
    return { totalDocuments, openCases, departments };
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) => c.case_number.toLowerCase().includes(q) || c.case_type.toLowerCase().includes(q) || c.department.toLowerCase().includes(q)
    );
  }, [cases, query]);

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
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1.1 }}>
                DigiVault
              </div>
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
              style={{
                border: "1px solid #1e293b",
                background: "transparent",
                color: "#cbd5e1",
                borderRadius: 4,
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 28px 56px" }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, marginBottom: 28, flexWrap: "wrap" }}
        >
          <div>
            <p style={{ margin: "0 0 6px", color: "#4a90c4", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              Case Registry
            </p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: -0.5 }}>
              Active Evidence Cases
            </h1>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            style={{
              background: showForm ? "transparent" : "#1e293b",
              color: "#cbd5e1",
              border: `1px solid ${showForm ? "#1e293b" : "#4a90c4"}`,
              borderRadius: 4,
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: showForm ? "none" : "0 0 20px rgba(74,144,196,0.18)",
            }}
          >
            {showForm ? "Cancel" : "+ New Case"}
          </button>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
          <StatCard icon={<CaseIcon />} label="Total Cases" value={cases.length} index={0} />
          <StatCard icon={<OpenIcon />} label="Open Cases" value={stats.openCases} index={1} />
          <StatCard icon={<DocumentsIcon />} label="Documents" value={stats.totalDocuments} index={2} />
          <StatCard icon={<DeptIcon />} label="Departments" value={stats.departments} index={3} />
        </div>

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, marginBottom: 16, padding: "10px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 4 }}>
            {error}
          </p>
        )}

        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.25 }}
            onSubmit={handleCreate}
            style={{
              position: "relative",
              marginBottom: 24,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
              padding: 18,
              background: "linear-gradient(165deg, rgba(22,33,52,0.55) 0%, rgba(10,15,24,0.42) 100%)",
              border: "1px solid rgba(74,144,196,0.25)",
              borderRadius: 6,
              boxShadow: CARD_SHADOW,
              overflow: "hidden",
            }}
          >
            <CornerBracket corner="tl" />
            <CornerBracket corner="br" />
            <input
              placeholder="Case number (e.g. FIR/2026/0042)"
              value={form.case_number}
              onChange={(e) => setForm({ ...form, case_number: e.target.value })}
              required
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Case type"
              value={form.case_type}
              onChange={(e) => setForm({ ...form, case_type: e.target.value })}
              required
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              required
              style={TEXT_INPUT_STYLE}
            />
            <button
              type="submit"
              style={{
                background: "#1e293b",
                color: "#cbd5e1",
                border: "1px solid #4a90c4",
                borderRadius: 4,
                padding: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Create case
            </button>
          </motion.form>
        )}

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

          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(74,144,196,0.12)" }}>
            <div style={{ position: "relative", maxWidth: 320 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <SearchIcon />
              </span>
              <input
                placeholder="Search by case #, type, or department"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...TEXT_INPUT_STYLE, width: "100%", paddingLeft: 32, boxSizing: "border-box" }}
              />
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(74,144,196,0.15)" }}>
                {["Case #", "Type", "Status", "Created", "Documents", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      fontWeight: 600,
                      color: "#6b7280",
                      fontSize: 11,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                [0, 1, 2].map((i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(74,144,196,0.08)" }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: "16px" }}>
                        <div
                          style={{
                            height: 12,
                            borderRadius: 3,
                            background: "rgba(74,144,196,0.08)",
                            width: j === 5 ? "40%" : "70%",
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading &&
                filteredCases.map((c) => (
                  <motion.tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/cases/${c.id}`)}
                    style={{ borderBottom: "1px solid rgba(74,144,196,0.08)", cursor: "pointer" }}
                    whileHover={{ background: "rgba(74,144,196,0.06)" }}
                  >
                    <td style={{ padding: "14px 16px", fontFamily: "monospace", color: "#7ab4e8" }}>{c.case_number}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <TypeTag type={c.case_type} />
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <StatusPill status={c.status} />
                    </td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af" }}>{c.document_count}</td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <Link
                        href={`/dashboard/cases/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: "#4a90c4",
                          fontWeight: 700,
                          textDecoration: "none",
                          fontSize: 12.5,
                          letterSpacing: 0.3,
                        }}
                      >
                        View →
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              {!loading && filteredCases.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "48px 16px" }}>
                    <div style={{ display: "grid", justifyItems: "center", gap: 10, color: "#6b7280" }}>
                      <EmptyIcon />
                      <span>{cases.length === 0 ? "No cases yet — create one to get started." : "No cases match your search."}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
