// Real end-to-end check for step 6 Part 3: goes through the actual UI flow
// (login -> case -> upload -> confirm redaction with PIN step-up ->
// automatic anchor) to produce a real anchored version on Polygon Amoy,
// downloads the verification bundle, then opens /verify in a SEPARATE,
// unauthenticated browser context (no cookies/localStorage/session at all —
// simulating a logged-out visitor a year later) and feeds the files in.
//
// The portal only trusts the official EvidenceAnchor contract on Amoy
// (F-02), so this needs the web app's AMOY_RPC_URL to reach real Amoy —
// a local Hardhat chain can no longer stand in. It also checks that a
// proof pointing at a different contract is rejected as untrusted.
//
// Prereqs: seeded users, web app on E2E_BASE_URL, apps/ai-service running,
// a reachable AMOY_RPC_URL and a funded deployer wallet.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BASE,
  login,
  createAndOpenCase,
  uploadDocument,
  confirmFirstSuggestion,
  waitForAnchor,
  makeTestPdf,
  logBrowserErrors,
  stepUpWithPin,
} from "./e2e-helpers.mjs";

async function verifyInPortal(browser, pngPaths, proofPath) {
  const anonCtx = await browser.newContext();
  const verifyPage = await anonCtx.newPage();
  logBrowserErrors(verifyPage, "anon");
  await verifyPage.goto(`${BASE}/verify`);

  const hasSession = await verifyPage.evaluate(() => {
    try {
      return window.localStorage.getItem("digivault_session") !== null;
    } catch {
      return false;
    }
  });
  if (hasSession) throw new Error("Verify portal context unexpectedly has a session");

  await verifyPage.setInputFiles('input[accept="application/json"]', proofPath);
  await verifyPage.setInputFiles('input[accept="image/png"]', pngPaths);
  await verifyPage.click('button:has-text("Verify")');
  await verifyPage.waitForFunction(() => !document.body.innerText.includes("Checking blockchain record"), null, {
    timeout: 60000,
  });
  const verdict = await verifyPage.locator(".result-card h2").textContent();
  const officialLabel = (await verifyPage.locator("text=Verified against official DigiVault contract").count()) > 0;
  const detail = await verifyPage.locator(".result-card p").last().textContent();
  await anonCtx.close();
  return { verdict, officialLabel, detail };
}

async function main() {
  const pdfPath = await makeTestPdf("e2e-test-part3.pdf", "E2E test FIR — Part 3 (verify portal)");
  const downloadDir = mkdtempSync(path.join(tmpdir(), "digivault-verify-bundle-"));
  const browser = await chromium.launch();

  // --- Authenticated context: produce a real anchored redacted version ---
  const officerCtx = await browser.newContext({ acceptDownloads: true });
  const page = await officerCtx.newPage();
  logBrowserErrors(page, "officer");

  await login(page);
  await createAndOpenCase(page, "E2E-P3");
  console.log("STEP: uploaded ->", await uploadDocument(page, pdfPath, "E2E Test FIR Part 3"));
  console.log("STEP: redaction confirmed (PIN step-up) ->", await confirmFirstSuggestion(page, stepUpWithPin()));

  const anchor = await waitForAnchor(page);
  console.log("STEP: automatic anchor ->", anchor);
  if (anchor !== "ANCHORED") {
    const reason = await page.locator("section:has(h2:text('Integrity')) .wsv-status-text").last().textContent().catch(() => "");
    throw new Error(`Expected an on-chain anchor for this test, got ${anchor}: ${reason}`);
  }

  const downloads = [];
  page.on("download", (d) => downloads.push(d));
  await page.click('button:has-text("Download verification bundle")');
  await page.waitForTimeout(3000); // multiple sequential downloads triggered from one click
  const savedPaths = [];
  for (const d of downloads) {
    const dest = path.join(downloadDir, d.suggestedFilename());
    await d.saveAs(dest);
    savedPaths.push(dest);
  }
  console.log("STEP: bundle saved to", downloadDir, savedPaths.map((p) => path.basename(p)));
  await officerCtx.close();

  const proofPath = savedPaths.find((p) => p.endsWith(".json"));
  const pngPaths = savedPaths.filter((p) => p.endsWith(".png"));

  // --- Unauthenticated: genuine bundle must verify against the official contract ---
  const genuine = await verifyInPortal(browser, pngPaths, proofPath);
  console.log("STEP: portal verdict (genuine) ->", genuine.verdict, "| official label:", genuine.officialLabel);

  // --- Unauthenticated: same bundle, proof re-pointed at another contract ---
  const forged = JSON.parse(readFileSync(proofPath, "utf8"));
  forged.anchor.contract_address = "0x1111111111111111111111111111111111111111";
  const forgedPath = path.join(downloadDir, "forged-proof.json");
  writeFileSync(forgedPath, JSON.stringify(forged));
  const forgedResult = await verifyInPortal(browser, pngPaths, forgedPath);
  console.log("STEP: portal verdict (forged contract) ->", forgedResult.verdict);

  await browser.close();
  console.log(JSON.stringify({ genuine: genuine.verdict, forged: forgedResult.verdict, downloadDir }));

  if (!genuine.verdict.startsWith("Verified") || !genuine.officialLabel) {
    console.log("DETAIL:", genuine.detail);
    process.exit(1);
  }
  if (!forgedResult.verdict.includes("untrusted contract")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
