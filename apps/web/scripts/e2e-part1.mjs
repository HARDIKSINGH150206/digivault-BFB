// Real end-to-end check for step 6 Part 1: drives the actual UI in a real
// browser (Playwright/Chromium) — Service Number + PIN login, case creation,
// and the upload flow, which runs the real packages/crypto-core pipeline
// client-side. Not wired into a test runner.
//
// Prereqs: `node prisma/seed-for-testing.mjs`, web app on E2E_BASE_URL
// (default http://localhost:3000).
import { chromium } from "playwright";
import { BASE, login, createAndOpenCase, uploadDocument, makeTestPdf, logBrowserErrors } from "./e2e-helpers.mjs";

async function main() {
  const pdfPath = await makeTestPdf("e2e-test.pdf", "E2E test FIR", 2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  logBrowserErrors(page);

  // Wrong PIN is rejected with the generic message and no session.
  await page.goto(`${BASE}/login`);
  await page.fill("#service-number", "DL/2019/3301");
  await page.fill("#pin", "000000");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Invalid service number or PIN", { timeout: 15000 });
  console.log("STEP: wrong PIN rejected");

  await login(page);
  console.log("STEP: logged in ->", page.url());

  const caseNumber = await createAndOpenCase(page, "E2E");
  console.log("STEP: case created and opened ->", caseNumber, page.url());

  console.log("STEP: submitting upload (client-side hashing + real POST)...");
  const finalUrl = await uploadDocument(page, pdfPath, "E2E Test FIR");
  console.log("STEP: redirected to version detail ->", finalUrl);

  const [, documentId, versionId] = finalUrl.match(/documents\/([^/]+)\/versions\/([^/]+)/);
  await browser.close();
  console.log(JSON.stringify({ documentId, versionId, caseNumber }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
