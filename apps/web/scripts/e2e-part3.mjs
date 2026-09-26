// Real end-to-end check for step 6 Part 3: goes through the actual Part 2
// UI flow (login -> case -> upload -> confirm redaction -> anchor) to
// produce a real anchored version, downloads the real verification
// bundle, then opens /verify in a SEPARATE, unauthenticated browser
// context (no cookies/localStorage/session at all — simulating a
// logged-out visitor a year later) and feeds the downloaded files in.
//
// The on-chain leg is checked against a local Hardhat node standing in
// for Polygon Amoy (this sandbox has no route to the public Amoy RPC) —
// see the audit report for exactly what that does and doesn't prove.
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3100";
const LOCAL_RPC = "http://127.0.0.1:8545";

async function makeTestPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("E2E test FIR — Part 3 (verify portal)", { x: 50, y: 780, size: 16, font });
  const bytes = await doc.save();
  const outPath = path.join(__dirname, "e2e-test-part3.pdf");
  writeFileSync(outPath, bytes);
  return outPath;
}

async function main() {
  const pdfPath = await makeTestPdf();
  const downloadDir = mkdtempSync(path.join(tmpdir(), "digivault-verify-bundle-"));

  const browser = await chromium.launch();

  // --- Authenticated context: produce a real anchored version via Part 2's UI ---
  const officerCtx = await browser.newContext({ acceptDownloads: true });
  const page = await officerCtx.newPage();
  page.on("pageerror", (err) => console.error("[officer:pageerror]", err));

  await page.goto(`${BASE}/login`);
  await page.waitForFunction(() => document.querySelector("select")?.options.length > 0);
  const optionValue = await page.$eval(
    "select",
    (el) => Array.from(el.options).find((o) => o.textContent?.includes("INVESTIGATING_OFFICER"))?.value
  );
  await page.selectOption("select", optionValue);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/);

  const caseNumber = `E2E-P3/${Date.now()}`;
  await page.click("text=+ New case");
  await page.fill('input[placeholder^="Case number"]', caseNumber);
  await page.fill('input[placeholder="Case type"]', "FIR");
  await page.fill('input[placeholder="Department"]', "Women Safety Division");
  await page.click('button:has-text("Create case")');
  await page.waitForSelector(`text=${caseNumber}`);
  const row = page.locator("tr", { hasText: caseNumber });
  await row.locator("a", { hasText: "Open" }).click();
  await page.waitForURL(/\/dashboard\/cases\/.+$/);
  await page.click("text=+ Upload document");
  await page.waitForURL(/\/upload$/);
  await page.fill('input[placeholder="Document title"]', "E2E Test FIR Part 3");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard\/documents\/.+\/versions\/.+$/, { timeout: 30000 });
  const v1Url = page.url();
  console.log("STEP: uploaded ->", v1Url);

  await page.waitForFunction(() => document.querySelector("li input[type=checkbox]") !== null, { timeout: 15000 });
  await page.locator("li input[type=checkbox]").first().check();
  await page.click('button:has-text("Review 1 selected redaction")');
  await page.click('button:has-text("Yes, finalize redactions")');
  await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, v1Url, { timeout: 15000 });
  console.log("STEP: redaction confirmed, now on ->", page.url());

  console.log("STEP: anchoring against local test chain (standing in for Amoy)...");
  await page.click('button:has-text("Anchor this version")');
  await page.waitForSelector("text=/MinIO half succeeded|Anchored\\./", { timeout: 20000 });
  const anchorMsg = await page.locator("text=/MinIO half succeeded|Anchored\\./").textContent();
  console.log("STEP: anchor result ->", anchorMsg);
  if (!anchorMsg.includes("Anchored.")) {
    throw new Error(`Expected a successful on-chain anchor for this test, got: ${anchorMsg}`);
  }

  const downloads = [];
  page.on("download", (d) => downloads.push(d));
  await page.click('button:has-text("Download verification bundle")');
  await page.waitForTimeout(3000); // multiple sequential downloads triggered from one click
  console.log(`STEP: ${downloads.length} files downloaded from the bundle`);

  const savedPaths = [];
  for (const d of downloads) {
    const suggested = d.suggestedFilename();
    const dest = path.join(downloadDir, suggested);
    await d.saveAs(dest);
    savedPaths.push(dest);
  }
  console.log("STEP: bundle saved to", downloadDir, savedPaths.map((p) => path.basename(p)));

  await officerCtx.close();

  // --- Unauthenticated context: a completely fresh browser profile, no
  // cookies/localStorage/session of any kind — simulates a logged-out
  // visitor opening the portal with nothing but the downloaded files. ---
  const anonCtx = await browser.newContext();
  const verifyPage = await anonCtx.newPage();
  verifyPage.on("pageerror", (err) => console.error("[anon:pageerror]", err));

  await verifyPage.goto(`${BASE}/verify`);

  // Confirm there is truly no session anywhere in this context.
  const hasSession = await verifyPage.evaluate(() => {
    try {
      return window.localStorage.getItem("digivault_session") !== null;
    } catch {
      return false;
    }
  });
  console.log("STEP: anon context has a DigiVault session? ->", hasSession);
  if (hasSession) throw new Error("Verify portal context unexpectedly has a session");

  const proofPath = savedPaths.find((p) => p.endsWith(".json"));
  const pngPaths = savedPaths.filter((p) => p.endsWith(".png"));

  await verifyPage.setInputFiles('input[accept="application/json"]', proofPath);
  await verifyPage.setInputFiles('input[accept="image/png"]', pngPaths);

  await verifyPage.click("text=Show advanced options");
  const rpcInput = verifyPage.locator("label", { hasText: "Polygon RPC endpoint" }).locator("input");
  await rpcInput.fill(LOCAL_RPC);

  await verifyPage.click('button:has-text("Verify")');
  await verifyPage.waitForSelector("text=/Verified — matches public blockchain record|Mismatch — do not trust this document/", {
    timeout: 20000,
  });
  const verdict = await verifyPage.locator(
    "text=/Verified — matches public blockchain record|Mismatch — do not trust this document/"
  ).textContent();
  console.log("STEP: portal verdict ->", verdict);

  const pageContent = await verifyPage.content();
  if (verdict.includes("Mismatch")) {
    const detail = await verifyPage.locator("text=/recomputed=|proof=|on_chain=|Verification could not/").textContent().catch(() => "(no detail found)");
    console.log("MISMATCH DETAIL:", detail);
  }

  await browser.close();

  console.log(JSON.stringify({ verdict, downloadDir }));
  if (!verdict.includes("Verified")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
