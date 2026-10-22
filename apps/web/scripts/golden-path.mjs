// The demo golden path (docs/05) as one scripted run: a rehearsal that
// checks every step the audience is told about, with the named demo
// accounts, and times each step against the doc's budget.
//
//   1. IO logs in: dashboard shows BNSS deadline badges and alerts
//   2. New case, upload a scanned FIR: server re-check, version page
//   3. Anchored on Polygon Amoy, Polygonscan link
//   4. Review AI suggestions, create redacted version (PIN step-up), anchored
//   5. Download verification bundle, redaction proof, certificate (step-up)
//   6. Logged-out /verify: redaction proof + redacted pages -> Verified redacted copy
//   7. One pixel changed -> Mismatch
//   8. Certificate QR on a phone-sized logged-out browser -> Anchored
//   9. Admin anchors the audit head (step-up): "verified up to entry #N"
//  10. Court official: read-only (no upload), certificate available
//
// Works in a fresh REHEARSAL/<time> case so the demo cases stay clean.
// Prereqs (docs/05 §2): web app (+ AMOY_RPC_URL that resolves), apps/ai-service,
// prisma/seed-demo.ts and scripts/seed-deadline-cases.mjs run, a funded wallet.
// Spends ~0.008 POL: two document anchors and one audit-head anchor.
//
//   GOLDEN_PDF=public/sample-firs/<scan>.pdf node scripts/golden-path.mjs
// Without GOLDEN_PDF: public/sample-firs/messy-fir.pdf if present, else a
// scanned synthetic FIR from the Phase 6 test set (apps/ai-service/eval/out).
import { chromium, devices } from "playwright";
import jsQR from "jsqr";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASE, SCRIPTS_DIR, login, createAndOpenCase, uploadDocument, waitForAnchor, logBrowserErrors, stepUpWithPin } from "./e2e-helpers.mjs";

const IO = { serviceNumber: "UP/2021/4821", pin: "224466" }; // IO Rajiv Sharma (seed-demo.ts)
const ADMIN = { serviceNumber: "KA/2018/1042", pin: "112233" }; // SP Meera Iyer
const COURT = { serviceNumber: "DL/2020/7755", pin: "446688" }; // Court Official Anand
const OUT = mkdtempSync(path.join(tmpdir(), "dv-golden-"));

// Budgets from docs/05 §3 (seconds of wall time the step may take live).
const STEPS = [];
async function step(name, budgetS, fn) {
  const t0 = Date.now();
  let ok = false;
  let note = "";
  try {
    note = (await fn()) ?? "";
    ok = true;
  } catch (err) {
    note = err.message.split("\n")[0];
  }
  const secs = (Date.now() - t0) / 1000;
  STEPS.push({ name, ok, secs, budgetS, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${secs.toFixed(1)}s${secs > budgetS ? ` (budget ${budgetS}s)` : ""}  ${note}`);
  if (!ok) throw new Error(`step failed: ${name}: ${note}`);
}

async function demoPdf() {
  if (process.env.GOLDEN_PDF) return path.resolve(process.env.GOLDEN_PDF);
  const messy = path.join(SCRIPTS_DIR, "..", "public", "sample-firs", "messy-fir.pdf");
  if (existsSync(messy)) return messy;
  const png = path.join(SCRIPTS_DIR, "..", "..", "ai-service", "eval", "out", "pages", "en-02-scanned.png");
  if (!existsSync(png)) throw new Error("No GOLDEN_PDF, no public/sample-firs/messy-fir.pdf and no eval test set; run `pnpm eval:redaction` or pass GOLDEN_PDF");
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawImage(await doc.embedPng(readFileSync(png)), { x: 0, y: 0, width: 595, height: 842 });
  const out = path.join(OUT, "synthetic-scanned-fir.pdf");
  writeFileSync(out, await doc.save());
  return out;
}

async function saveDownloads(page, clickSelector, count, afterClick) {
  const got = [];
  const onDownload = (d) => got.push(d);
  page.on("download", onDownload);
  await page.click(clickSelector);
  if (afterClick) await afterClick(page);
  const deadline = Date.now() + 30000;
  while (got.length < count && Date.now() < deadline) await page.waitForTimeout(250);
  await page.waitForTimeout(1500); // a bundle triggers several downloads in a row
  page.off("download", onDownload);
  const paths = [];
  for (const d of got) {
    const dest = path.join(OUT, d.suggestedFilename());
    await d.saveAs(dest);
    paths.push(dest);
  }
  if (paths.length < count) throw new Error(`expected ${count} download(s), got ${paths.length}`);
  return paths;
}

async function portal(browser, files) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  logBrowserErrors(page, "verify");
  const apiCalls = [];
  page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/") && apiCalls.push(r.url()));
  await page.goto(`${BASE}/verify`);
  await page.setInputFiles('input[accept="application/json"]', files.proof);
  await page.setInputFiles('input[accept="image/png"]', files.pngs);
  await page.click('button:has-text("Verify")');
  await page.waitForFunction(() => !document.body.innerText.includes("Checking blockchain record"), null, { timeout: 90000 });
  const verdict = (await page.locator(".result-card h2").first().textContent()) ?? "";
  const official = (await page.locator("text=Verified against official DigiVault contract").count()) > 0;
  await page.screenshot({ path: path.join(OUT, `verify-${verdict.split(" ")[0].toLowerCase()}.png`), fullPage: true });
  await ctx.close();
  if (apiCalls.length) throw new Error(`/verify called the app's API: ${apiCalls.join(", ")}`);
  return { verdict, official };
}

async function qrFromPdf(pdfPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pdfPath)), isEvalSupported: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const img = await new Promise((resolve) => page.objs.get(ops.argsArray[i][0], resolve));
    const rgba = new Uint8ClampedArray(img.width * img.height * 4);
    for (let p = 0; p < img.width * img.height; p++) {
      if (img.kind === 3) rgba.set(img.data.subarray(p * 4, p * 4 + 4), p * 4);
      else rgba.set([img.data[p * 3], img.data[p * 3 + 1], img.data[p * 3 + 2], 255], p * 4);
    }
    const code = jsQR(rgba, img.width, img.height);
    if (code) return code.data;
  }
  throw new Error("no QR code in the certificate");
}

async function main() {
  const pdf = await demoPdf();
  console.log(`document: ${pdf}\nfiles:    ${OUT}\n`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  const page = await ctx.newPage();
  logBrowserErrors(page);
  let caseUrl, v1Url, v2Url, bundle, redactionProof, certPdf;

  try {
    await step("1 IO dashboard: deadline badges and alerts", 45, async () => {
      await login(page, IO);
      await page.waitForSelector("text=Needs your attention", { timeout: 20000 });
      const badge = page.locator("text=/Day \\d+ of 60|Overdue by \\d+ days?|Due today/");
      // The case list loads after the page heading.
      await badge.first().waitFor({ timeout: 20000 }).catch(() => {
        throw new Error("no BNSS deadline badge: run scripts/seed-deadline-cases.mjs");
      });
      const badges = await badge.count();
      await page.screenshot({ path: path.join(OUT, "1-dashboard.png"), fullPage: true });
      return `${badges} deadline badge(s)`;
    });

    await step("2 New case and upload: server re-check, version page", 60, async () => {
      await createAndOpenCase(page, "REHEARSAL");
      caseUrl = page.url();
      v1Url = await uploadDocument(page, pdf, `Rehearsal FIR ${new Date().toISOString().slice(0, 16)}`);
      return new URL(v1Url).pathname;
    });

    await step("3 Anchored on Polygon Amoy, Polygonscan link", 60, async () => {
      const status = await waitForAnchor(page, 150000);
      if (status !== "ANCHORED") throw new Error(`anchor ${status}`);
      const link = await page.locator('a[href^="https://amoy.polygonscan.com/tx/"]').first().getAttribute("href");
      if (!link) throw new Error("no Polygonscan link");
      await page.screenshot({ path: path.join(OUT, "3-anchored.png"), fullPage: true });
      return link;
    });

    await step("4 Review suggestions, redacted version (PIN step-up), anchored", 75, async () => {
      await page.waitForSelector("li input[type=checkbox]", { timeout: 30000 });
      const groups = await page.locator("li input[type=checkbox]").all();
      for (const g of groups) await g.check();
      const high = await page.locator("text=/\\d+ high confidence/").count();
      // A scan with gold labels beside it (eval/messy.py): how much the suggestions cover, live.
      let coverage = "";
      const goldPath = pdf.replace(/\.pdf$/, ".gold.json");
      if (existsSync(goldPath)) {
        const gold = JSON.parse(readFileSync(goldPath, "utf8")).entities;
        const [, , , d, , v] = new URL(page.url()).pathname.split("/");
        const flagged = new Set(
          (await page.evaluate(async ([d, v]) => {
            const { token } = JSON.parse(localStorage.getItem("digivault_session"));
            const r = await fetch(`/api/v1/documents/${d}/versions/${v}/redaction-suggestions`, { headers: { Authorization: `Bearer ${token}` } });
            return (await r.json()).suggestions;
          }, [d, v])).map((x) => x.tile_index)
        );
        const full = gold.filter((e) => e.tiles.every((t) => flagged.has(t))).length;
        const part = gold.filter((e) => e.tiles.some((t) => flagged.has(t))).length;
        if (part < gold.length) throw new Error(`${gold.length - part} identifier(s) with no suggestion at all`);
        coverage = `; identifiers fully covered ${full}/${gold.length}, at least partly ${part}/${gold.length}`;
      }
      await page.screenshot({ path: path.join(OUT, "4-review.png"), fullPage: true });
      await page.locator("button", { hasText: /^Review \d+ selected areas?$/ }).click();
      await page.click('button:has-text("Create redacted version")');
      await stepUpWithPin(IO.pin)(page);
      await page.waitForFunction((old) => window.location.href !== old, v1Url, { timeout: 60000 });
      v2Url = page.url();
      const status = await waitForAnchor(page, 150000);
      if (status !== "ANCHORED") throw new Error(`redacted version anchor ${status}`);
      return `${groups.length} suggestion group(s), ${high} with high-confidence areas${coverage}`;
    });

    await step("5 Downloads: bundle, redaction proof, certificate (step-up)", 45, async () => {
      bundle = await saveDownloads(page, 'button:has-text("Download verification bundle")', 2);
      [redactionProof] = await saveDownloads(page, 'button:has-text("Download redaction proof")', 1);
      [certPdf] = await saveDownloads(page, 'button:has-text("Download certificate")', 1, (p) => stepUpWithPin(IO.pin)(p));
      return [...bundle, redactionProof, certPdf].map((p) => path.basename(p)).join(", ");
    });

    const pngs = bundle.filter((p) => p.endsWith(".png")).sort();
    await step("6 Logged-out /verify: Verified redacted copy", 45, async () => {
      const r = await portal(browser, { proof: redactionProof, pngs });
      if (!r.verdict.startsWith("Verified redacted copy") || !r.official) throw new Error(`verdict: ${r.verdict}`);
      return r.verdict;
    });

    await step("7 One pixel changed: Mismatch", 30, async () => {
      const { data, info } = await sharp(pngs[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      data[0] ^= 0xff;
      const tampered = path.join(OUT, "tampered-" + path.basename(pngs[0]));
      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(tampered);
      const r = await portal(browser, { proof: redactionProof, pngs: [tampered, ...pngs.slice(1)] });
      if (!r.verdict.startsWith("Mismatch")) throw new Error(`verdict: ${r.verdict}`);
      return r.verdict;
    });

    await step("8 Certificate QR on a phone: Anchored", 45, async () => {
      const qr = await qrFromPdf(certPdf);
      const phone = await browser.newContext({ ...devices["Pixel 7"] });
      const p = await phone.newPage();
      await p.goto(qr);
      const card = p.getByTestId("certificate-check");
      await card.waitFor({ timeout: 30000 });
      await p.waitForFunction(() => !document.querySelector('[data-testid="certificate-check"]')?.textContent?.includes("Checking"), null, { timeout: 60000 });
      const text = await card.innerText();
      await p.screenshot({ path: path.join(OUT, "8-phone.png"), fullPage: true });
      await phone.close();
      if (!text.includes("Anchored:")) throw new Error(text.split("\n")[0]);
      return qr;
    });

    await step("9 Admin anchors the audit head", 45, async () => {
      const admin = await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
      await login(admin, ADMIN);
      await admin.goto(`${BASE}/dashboard/audit`);
      await admin.click('button:has-text("Anchor audit head now")');
      await stepUpWithPin(ADMIN.pin)(admin);
      await admin.waitForFunction(() => /Audit log verified up to entry #\d+/.test(document.body.innerText) && !document.body.innerText.includes("Anchoring…"), null, { timeout: 120000 });
      const line = (await admin.locator("text=/Audit log verified up to entry #\\d+/").first().textContent()) ?? "";
      await admin.screenshot({ path: path.join(OUT, "9-audit.png"), fullPage: true });
      await admin.context().close();
      return line.trim();
    });

    await step("10 Court official: read-only, certificate available", 30, async () => {
      const court = await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
      await login(court, COURT);
      await court.goto(caseUrl);
      await court.waitForLoadState("networkidle");
      if ((await court.locator('a:has-text("Upload document")').count()) > 0) throw new Error("court official sees Upload document");
      await court.goto(v2Url);
      await court.locator('button:has-text("Download certificate")').waitFor({ timeout: 20000 });
      if ((await court.locator('button:has-text("Create redacted version")').count()) > 0) throw new Error("court official can redact");
      await court.context().close();
      return "no upload or redaction controls";
    });
  } finally {
    await browser.close();
    const total = STEPS.reduce((s, x) => s + x.secs, 0);
    console.log("\n| Step | Result | Time | Budget |\n|---|---|---|---|");
    for (const s of STEPS) console.log(`| ${s.name} | ${s.ok ? "pass" : "FAIL"} | ${s.secs.toFixed(0)}s | ${s.budgetS}s |`);
    console.log(`\n${STEPS.length}/10 steps run, ${STEPS.filter((s) => s.ok).length} passed, ${total.toFixed(0)}s; screenshots and files in ${OUT}`);
  }
  if (STEPS.length !== 10 || STEPS.some((s) => !s.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
