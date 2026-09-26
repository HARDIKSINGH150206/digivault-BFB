// Real end-to-end check for step 6 Part 2: login -> create case -> upload
// -> review AI suggestions -> confirm a redaction -> trigger anchor ->
// download the certificate, all through the actual UI in a real browser.
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3100";

async function makeTestPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  page.drawText("E2E test FIR — Part 2", { x: 50, y: 780, size: 16, font });
  const bytes = await doc.save();
  const outPath = path.join(__dirname, "e2e-test-part2.pdf");
  writeFileSync(outPath, bytes);
  return outPath;
}

async function main() {
  const pdfPath = await makeTestPdf();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error("[browser:pageerror]", err));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser:console:error]", msg.text());
  });
  page.on("request", (r) => {
    if (r.url().includes("/redactions/confirm")) {
      console.log("[request]", r.method(), r.url(), "postData:", r.postData());
    }
  });

  await page.goto(`${BASE}/login`);
  await page.waitForFunction(() => document.querySelector("select")?.options.length > 0);
  const optionValue = await page.$eval(
    "select",
    (el) => Array.from(el.options).find((o) => o.textContent?.includes("INVESTIGATING_OFFICER"))?.value
  );
  await page.selectOption("select", optionValue);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/);

  const caseNumber = `E2E-P2/${Date.now()}`;
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
  await page.fill('input[placeholder="Document title"]', "E2E Test FIR Part 2");
  await page.setInputFiles('input[type="file"]', pdfPath);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard\/documents\/.+\/versions\/.+$/, { timeout: 30000 });
  console.log("STEP: uploaded, on version page ->", page.url());
  const v1Url = page.url();

  // Suggestions should be present (ai-service call happened synchronously during upload).
  await page.waitForSelector('li:has-text("%")', { timeout: 15000 });
  const suggestionCount = await page.locator("li input[type=checkbox]").count();
  console.log("STEP: suggestions rendered, count =", suggestionCount);
  if (suggestionCount === 0) throw new Error("Expected at least one AI suggestion");

  // Select the first suggestion, review, and finalize.
  await page.locator("li input[type=checkbox]").first().check();
  await page.click('button:has-text("Review 1 selected redaction")');
  await page.click('button:has-text("Yes, finalize redactions")');
  await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, v1Url, { timeout: 15000 });
  console.log("STEP: redaction confirmed, new version ->", page.url());

  const versionText = await page.locator("h1").textContent();
  console.log("STEP: version heading ->", versionText);
  if (!versionText.includes("v2")) throw new Error(`Expected v2 after confirm, got: ${versionText}`);

  // Trigger anchor (will fail on-chain in this sandbox — no route to
  // rpc-amoy.polygon.technology — but the MinIO half + UI flow should work).
  await page.click('button:has-text("Anchor this version")');
  await page.waitForSelector("text=/MinIO half succeeded|Anchored\\./", { timeout: 20000 });
  const anchorMsg = await page.locator("text=/MinIO half succeeded|Anchored\\./").textContent();
  console.log("STEP: anchor result ->", anchorMsg);

  // Download certificate.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Download certificate")'),
  ]);
  const certPath = await download.path();
  console.log("STEP: certificate downloaded ->", certPath);

  const finalUrl = page.url();
  const match = finalUrl.match(/documents\/([^/]+)\/versions\/([^/]+)/);
  await browser.close();
  console.log(JSON.stringify({ documentId: match[1], versionId: match[2], caseNumber, certPath }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
