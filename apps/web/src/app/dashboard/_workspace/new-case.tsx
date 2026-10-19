"use client";

/**
 * "+ New Case" button and inline form. Existing endpoint only:
 *   POST /api/v1/cases { case_number, case_type, department, fir_registered_at?, offence_sections? }
 * The last two drive the BNSS s.193(2) deadline (docs/07 Phase 7).
 * Render it only for roles `can(role, "createCase")` allows.
 */

import { useState } from "react";
import { apiJson, ApiError } from "@/lib/client/api-client";
import { Icon } from "./shell";

const EMPTY = { case_number: "", case_type: "FIR", department: "Women Safety Division", fir_registered_at: "", offence_sections: "" };

export function NewCaseControl({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiJson("/api/v1/cases", {
        method: "POST",
        body: JSON.stringify({ ...form, fir_registered_at: form.fir_registered_at || null }),
      });
      setOpen(false);
      setForm(EMPTY);
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the case.");
    } finally {
      setCreating(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ws-primary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={18} /> New Case
      </button>
    );
  }

  return (
    <div style={{ flexBasis: "100%" }}>
      <form className="ws-form" onSubmit={handleCreate} aria-label="Create a case" style={{ marginTop: 4 }}>
        <label>
          Case number
          <input className="ws-input" required placeholder="e.g. FIR/2026/0042" value={form.case_number} onChange={(e) => setForm({ ...form, case_number: e.target.value })} />
        </label>
        <label>
          Case type
          <input className="ws-input" required value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })} />
        </label>
        <label>
          Department
          <input className="ws-input" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </label>
        <label>
          FIR registered on
          <input className="ws-input" type="date" max={new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)} value={form.fir_registered_at} onChange={(e) => setForm({ ...form, fir_registered_at: e.target.value })} />
        </label>
        <label>
          Offence sections
          <input className="ws-input" placeholder="e.g. BNS 64, 74; POCSO 4" value={form.offence_sections} onChange={(e) => setForm({ ...form, offence_sections: e.target.value })} />
        </label>
        <div className="ws-form-actions">
          <button type="submit" className="ws-primary" disabled={creating}>
            {creating ? "Creating…" : "Create case"}
          </button>
          <button type="button" className="ws-secondary" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </button>
        </div>
      </form>
      {error && <p className="ws-alert" role="alert">{error}</p>}
    </div>
  );
}
