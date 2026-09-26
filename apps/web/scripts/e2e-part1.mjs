// Real end-to-end check for step 6 Part 1: drives the actual UI in a real
// browser (Playwright/Chromium) — login screen, case creation, and the
// upload flow, which runs the real packages/crypto-core pipeline
// client-side. Not wired into a test runner; throwaway verification script.
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
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`E2E test FIR page ${i + 1}`, { x: 50, y: 780, size: 16, font });
    page.drawText("Complainant stated the incident occurred near the market area.", {
      x: 50,
      y: 740,
      size: 11,
      font,
    });
  }
  const bytes = await doc.save();
  const outPath = path.join(__dirname, "e2e-test.pdf");
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

  await page.goto(`${BASE}/login`);
  await page.waitForSelector("select");
  const optionValue = await page.$eval(
    "select",
    (el) => Array.from(el.options).find((o) => o.textContent?.includes("INVESTIGATING_OFFICER"))?.value
  );
  await page.selectOption("select", optionValue);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  console.log("STEP: logged in ->", page.url());

  const caseNumber = `E2E/${Date.now()}`;
  await page.click("text=+ New case");
  await page.fill('input[placeholder^="Case number"]', caseNumber);
  await page.fill('input[placeholder="Case type"]', "FIR");
  await page.fill('input[placeholder="Department"]', "Women Safety Division");
  await page.click('button:has-text("Create case")');
  await page.waitForSelector(`text=${caseNumber}`, { timeout: 10000 });
  console.log("STEP: case created ->", caseNumber);

  const row = page.locator("tr", { hasText: caseNumber });
  await row.locator("a", { hasText: "Open" }).click();
  console.log("STEP: clicked Open, url now ->", page.url());
  await page.waitForURL(/\/dashboard\/cases\/.+$/, { timeout: 10000 });
  console.log("STEP: on case detail ->", page.url());
  await page.click("text=+ Upload document");
  await page.waitForURL(/\/upload$/, { timeout: 10000 });

  await page.fill('input[placeholder="Document title"]', "E2E Test FIR");
  await page.setInputFiles('input[type="file"]', pdfPath);
  console.log("STEP: submitting upload (client-side hashing + real POST)...");
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/dashboard\/documents\/.+\/versions\/.+$/, { timeout: 30000 });
  const finalUrl = page.url();
  console.log("STEP: redirected to version detail ->", finalUrl);

  const match = finalUrl.match(/documents\/([^/]+)\/versions\/([^/]+)/);
  const [, documentId, versionId] = match;

  await browser.close();
  console.log(JSON.stringify({ documentId, versionId, caseNumber }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
