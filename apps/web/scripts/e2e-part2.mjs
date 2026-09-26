// Real end-to-end check for step 6 Part 2: login -> create case -> upload
// -> review AI suggestions -> confirm a redaction (biometric step-up) ->
// automatic anchor -> download the certificate (biometric step-up) ->
// share only the redacted version. All through the actual UI.
//
// The fingerprint / Face ID check uses a Chrome DevTools virtual
// authenticator; the first step-up enrols it (PIN required), the second
// is a pure WebAuthn assertion.
//
// Prereqs: seeded users, web app on E2E_BASE_URL, apps/ai-service running.
import { chromium } from "playwright";
import {
  BASE,
  login,
  createAndOpenCase,
  uploadDocument,
  confirmFirstSuggestion,
  waitForAnchor,
  makeTestPdf,
  logBrowserErrors,
  addVirtualAuthenticator,
  stepUpWithBiometric,
} from "./e2e-helpers.mjs";

async function main() {
  const pdfPath = await makeTestPdf("e2e-test-part2.pdf", "E2E test FIR — Part 2");
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  logBrowserErrors(page);
  await addVirtualAuthenticator(context, page);

  await login(page);
  const caseNumber = await createAndOpenCase(page, "E2E-P2");
  const v1Url = await uploadDocument(page, pdfPath, "E2E Test FIR Part 2");
  console.log("STEP: uploaded, on version page ->", v1Url);

  // F-03: nothing is shareable until a redacted version exists.
  await page.waitForSelector("text=Confirm redactions first");
  const shareButton = page.locator('button:has-text("Generate share link")');
  if ((await shareButton.count()) > 0 && !(await shareButton.isDisabled())) {
    throw new Error("Share link creation should not be offered before redactions are confirmed");
  }
  console.log("STEP: sharing blocked on unredacted v1");

  const v2Url = await confirmFirstSuggestion(page, stepUpWithBiometric());
  console.log("STEP: redaction confirmed (biometric step-up, enrolled) ->", v2Url);
  const versionText = await page.locator("h1").textContent();
  const versionNo = await page.locator("text=/^Version \\d+$/").first().textContent();
  console.log("STEP: version heading ->", versionNo, versionText);
  if (versionNo !== "Version 2") throw new Error(`Expected Version 2 after confirm, got: ${versionNo}`);

  // Anchoring is automatic now; FAILED is reported, not fatal, here.
  const anchor = await waitForAnchor(page);
  console.log("STEP: automatic anchor ->", anchor);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Download certificate")').then(() => stepUpWithBiometric()(page)),
  ]);
  const certPath = await download.path();
  console.log("STEP: certificate downloaded (biometric step-up) ->", certPath);

  // Share the redacted version and fetch it as the recipient would.
  await page.fill("#share-recipient", "E2E Sessions Court");
  await page.click('button:has-text("Generate share link")');
  const shareUrl = await page.locator("code", { hasText: "/shares/" }).textContent({ timeout: 15000 });
  const token = shareUrl.split("/shares/")[1];
  const res = await page.request.get(`${BASE}/api/v1/shares/${token}/download`);
  const disposition = res.headers()["content-disposition"] ?? "";
  console.log("STEP: share download ->", res.status(), disposition);
  if (res.status() !== 200 || !disposition.includes("-v2.pdf")) {
    throw new Error("Share download should serve the redacted v2");
  }

  const [, documentId, versionId] = page.url().match(/documents\/([^/]+)\/versions\/([^/]+)/);
  await browser.close();
  console.log(JSON.stringify({ documentId, versionId, caseNumber, anchor, certPath }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
