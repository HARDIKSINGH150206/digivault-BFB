// Demo cases for the BNSS s.193(2) deadline badge (docs/07 Phase 7).
// Creates them through the API (or re-dates them if they exist), with FIR
// registration dates counted back from TODAY in India time, so the badges
// are the same whenever the demo runs. No documents, so no gas is spent.
//
//   node scripts/seed-deadline-cases.mjs     (web app on E2E_BASE_URL)
import { fileURLToPath } from "node:url";
import { BASE, INVESTIGATING_OFFICER } from "./e2e-helpers.mjs";

/** expect: the badge level, or null when the rule must not apply. */
export const DEADLINE_CASES = [
  { case_number: "KA/2026/CR/00210", days_ago: 50, offence_sections: "BNS 64, 74", expect: "amber" },
  { case_number: "UP/2026/CR/00388", days_ago: 57, offence_sections: "POCSO 6, BNS 65(2)", expect: "red" },
  { case_number: "MH/2026/CR/00415", days_ago: 63, offence_sections: "BNS 70(1)", expect: "overdue" },
  { case_number: "DL/2026/CR/00502", days_ago: 12, offence_sections: "BNS 64", expect: "on_track" },
  // BNS 74 and 79 (assault / insulting modesty) are offences against women but not under s.193(2).
  { case_number: "KA/2026/CR/00233", days_ago: 50, offence_sections: "BNS 74, 79", expect: null },
  { case_number: "TN/2026/CR/00120", days_ago: 70, offence_sections: "BNS 64", status: "CLOSED", expect: null },
];

/** YYYY-MM-DD in India time, n days before now. */
export function istDaysAgo(n, now = new Date()) {
  return new Date(now.getTime() + 5.5 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
}

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export async function login(user = INVESTIGATING_OFFICER) {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(user) });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return (await res.json()).token;
}

/** Returns the seeded cases as the API reports them, in DEADLINE_CASES order. */
export async function seedDeadlineCases(token) {
  const { cases } = await call("GET", "/api/v1/cases", token);
  const out = [];
  for (const c of DEADLINE_CASES) {
    const fields = { fir_registered_at: istDaysAgo(c.days_ago), offence_sections: c.offence_sections };
    const existing = cases.find((k) => k.case_number === c.case_number);
    const row = existing
      ? await call("PATCH", `/api/v1/cases/${existing.id}`, token, fields)
      : await call("POST", "/api/v1/cases", token, {
          case_number: c.case_number,
          case_type: "FIR",
          department: "Women Safety Division",
          status: c.status ?? "OPEN",
          ...fields,
        });
    out.push(row);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await seedDeadlineCases(await login());
  for (const [i, r] of rows.entries()) {
    const d = r.bnss_deadline;
    console.log(`${r.case_number.padEnd(18)} ${DEADLINE_CASES[i].offence_sections.padEnd(20)} ${d ? `${d.level.padEnd(8)} ${d.label}, due ${d.due_on}` : "no deadline"}`);
  }
}
