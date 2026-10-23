// End-to-end check for docs/07 Phase 7 (BNSS s.193(2) deadline tracking).
// No documents are uploaded, so no gas is spent.
//   1. API: the seeded cases get the expected level (or none); bad input is
//      refused; a court official cannot change the dates; changes are audited.
//   2. UI: the day-50 case shows an amber badge and an alert, on the
//      dashboard and on its case page; the non-covered and closed cases show
//      no badge and no alert; red and overdue cases are alerted too.
//   3. UI: adding a covered section through "Edit FIR details" starts the clock.
//
//   node scripts/e2e-deadlines.mjs     (web app on E2E_BASE_URL)
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASE, login as uiLogin, logBrowserErrors } from "./e2e-helpers.mjs";
import { DEADLINE_CASES, istDaysAgo, login, seedDeadlineCases } from "./seed-deadline-cases.mjs";

const COURT_OFFICIAL = { serviceNumber: "MH/2020/5512", pin: "334455" };
const ADMIN = { serviceNumber: "NCRB/2018/0001", pin: "556677" };

async function call(method, pathname, token, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "dv-deadline-"));
  const results = {};

  // 1. API
  const token = await login();
  const rows = await seedDeadlineCases(token);
  results.api_levels_match = rows.every((r, i) => (r.bnss_deadline?.level ?? null) === DEADLINE_CASES[i].expect);
  const byNumber = Object.fromEntries(rows.map((r) => [r.case_number, r]));
  const amber = byNumber["KA/2026/CR/00210"];
  const uncovered = byNumber["KA/2026/CR/00233"];
  const closed = byNumber["TN/2026/CR/00120"];
  results.api_day_50_amber = amber.bnss_deadline?.day === 50 && amber.bnss_deadline.label === "Day 50 of 60";

  const future = await call("PATCH", `/api/v1/cases/${amber.id}`, token, { fir_registered_at: istDaysAgo(-3) });
  const tooMany = await call("PATCH", `/api/v1/cases/${amber.id}`, token, { offence_sections: Array.from({ length: 21 }, (_, i) => `BNS ${i}`) });
  const empty = await call("PATCH", `/api/v1/cases/${amber.id}`, token, {});
  results.api_rejects_bad_input = future.status === 400 && tooMany.status === 400 && empty.status === 400;

  const court = await call("PATCH", `/api/v1/cases/${amber.id}`, await login(COURT_OFFICIAL), { fir_registered_at: istDaysAgo(1) });
  results.api_court_official_cannot_change_403 = court.status === 403;

  const adminToken = await login(ADMIN);
  const audit = await call("GET", "/api/v1/admin/audit", adminToken);
  results.api_admin_audit_chain_still_ok = audit.status === 200 && audit.body.chain.ok === true;

  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1360, height: 1000 } })).newPage();
    logBrowserErrors(page, "io");
    await uiLogin(page);

    // 2. Dashboard: alerts for amber, red, overdue only; badges in the case table.
    const attention = page.locator('section[aria-labelledby="io-attention-title"]');
    await attention.getByText("KA/2026/CR/00210").first().waitFor({ timeout: 30000 });
    const alertText = await attention.locator('li[role="alert"]').allInnerTexts();
    const alerted = (n) => alertText.some((t) => t.includes(n));
    results.dashboard_alerts_amber_red_overdue = alerted("KA/2026/CR/00210") && alerted("UP/2026/CR/00388") && alerted("MH/2026/CR/00415");
    results.dashboard_no_alert_on_track_uncovered_closed = !alerted("DL/2026/CR/00502") && !alerted("KA/2026/CR/00233") && !alerted("TN/2026/CR/00120");
    results.dashboard_overdue_listed_first = alertText[0]?.includes("MH/2026/CR/00415") ?? false;
    await page.screenshot({ path: path.join(dir, "1-dashboard.png"), fullPage: true });

    // Case page, day 50: amber badge and alert.
    await page.goto(`${BASE}/dashboard/cases/${amber.id}`);
    const chip = page.getByTestId("bnss-deadline");
    await chip.waitFor({ timeout: 30000 });
    const alert = page.getByTestId("bnss-deadline-alert");
    results.case_day_50_amber_badge = (await chip.getAttribute("data-level")) === "amber" && (await chip.innerText()).includes("Day 50 of 60");
    results.case_day_50_alert = (await alert.count()) === 1 && (await alert.innerText()).includes("10 days left");
    await page.screenshot({ path: path.join(dir, "2-case-day-50.png"), fullPage: true });

    // Non-covered and closed: no badge, no alert.
    for (const [name, kase] of [["uncovered", uncovered], ["closed", closed]]) {
      await page.goto(`${BASE}/dashboard/cases/${kase.id}`);
      await page.getByText("BNSS s.193(2)").waitFor({ timeout: 30000 });
      results[`case_${name}_no_badge_no_alert`] = (await page.getByTestId("bnss-deadline").count()) === 0 && (await page.getByTestId("bnss-deadline-alert").count()) === 0;
      if (name === "uncovered") await page.screenshot({ path: path.join(dir, "3-case-uncovered.png"), fullPage: true });
    }

    // 3. Adding a covered section through the form starts the clock (then put it back).
    await page.goto(`${BASE}/dashboard/cases/${uncovered.id}`);
    await page.getByRole("button", { name: "Edit FIR details" }).click();
    await page.getByLabel("Offence sections").fill("BNS 74, 79, 64");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByTestId("bnss-deadline").waitFor({ timeout: 30000 });
    results.form_adding_bns_64_starts_clock = (await page.getByTestId("bnss-deadline").getAttribute("data-level")) === "amber";
    await call("PATCH", `/api/v1/cases/${uncovered.id}`, token, { offence_sections: "BNS 74, 79" });

    const after = await call("GET", "/api/v1/admin/audit", adminToken);
    results.edits_audited_chain_ok = after.body.chain.ok === true && after.body.chain.checked > audit.body.chain.checked;
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
  console.log(`Screenshots: ${dir}`);
  const failed = Object.entries(results).filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`FAILED: ${failed.map(([k]) => k).join(", ")}`);
    process.exit(1);
  }
  console.log(`All ${Object.keys(results).length} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
