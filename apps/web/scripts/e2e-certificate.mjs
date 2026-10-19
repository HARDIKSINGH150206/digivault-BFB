// End-to-end check for docs/07 Phase 5 (Section 63 certificate), against a
// version that is ALREADY anchored on Polygon Amoy — it spends no gas:
//   1. the certificate needs step-up, and its QR (decoded from the PDF
//      itself) is the version's public_verify_url (ADR-022);
//   2. opening that URL on a phone-sized, logged-out browser shows a green
//      "Anchored" result, from the chain alone;
//   3. dropping the pages and proof file turns it into full "Verified";
//   4. a link with an altered commitment is refused;
//   5. the version page shows the link and the plain statement.
//
// Usage (web app on E2E_BASE_URL, PUBLIC_BASE_URL set to a URL a phone can
// open, e.g. http://<LAN IP>:3000):
//   CERT_DOCUMENT_ID=... CERT_VERSION_ID=... node scripts/e2e-certificate.mjs
// The version must be anchored, unredacted and visible to the investigating
// officer. Screenshots go to the printed temp directory.
import { chromium, devices } from "playwright";
import jsQR from "jsqr";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASE, INVESTIGATING_OFFICER, login, logBrowserErrors } from "./e2e-helpers.mjs";

const { CERT_DOCUMENT_ID: documentId, CERT_VERSION_ID: versionId } = process.env;
if (!documentId || !versionId) throw new Error("Set CERT_DOCUMENT_ID and CERT_VERSION_ID to an anchored, unredacted version.");
const API = `${BASE}/api/v1/documents/${documentId}/versions/${versionId}`;

async function api(pathname, token, headers = {}) {
  return fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
}

async function post(pathname, body, headers = {}) {
  const res = await fetch(`${BASE}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return res.json();
}

/** Every image drawn on page 1 of the PDF, decoded by pdfjs, as RGBA. */
async function pdfImages(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const ops = await page.getOperatorList();
  const text = (await page.getTextContent()).items.map((i) => i.str).join(" ");
  const images = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const img = await new Promise((resolve) => page.objs.get(ops.argsArray[i][0], resolve));
    const rgba = new Uint8ClampedArray(img.width * img.height * 4);
    for (let p = 0; p < img.width * img.height; p++) {
      if (img.kind === 3) rgba.set(img.data.subarray(p * 4, p * 4 + 4), p * 4);
      else rgba.set([img.data[p * 3], img.data[p * 3 + 1], img.data[p * 3 + 2], 255], p * 4);
    }
    images.push({ width: img.width, height: img.height, rgba });
  }
  return { pages: doc.numPages, text, images };
}

async function waitForCertificateCheck(page) {
  const card = page.getByTestId("certificate-check");
  await card.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="certificate-check"]')?.textContent?.includes("Checking"), null, { timeout: 60000 });
  return card.innerText();
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "dv-cert-"));
  const results = {};

  const { token } = await post("/api/auth/login", INVESTIGATING_OFFICER);
  const info = await (await api("", token)).json();
  if (!info.public_verify_url) throw new Error(`Version ${versionId} is not anchored (no public_verify_url).`);
  if (info.is_redacted) throw new Error("Pick an unredacted version: a redacted one has no full verification bundle.");

  // 1. Certificate: step-up required; the QR in the PDF is the verify URL.
  results.certificate_without_step_up_401 = (await api("/certificate", token)).status === 401;
  const { step_up_token: stepUp } = await post("/api/auth/verify-pin", { pin: INVESTIGATING_OFFICER.pin }, { Authorization: `Bearer ${token}` });
  const certRes = await api("/certificate", token, { "X-StepUp-Token": stepUp });
  const pdf = new Uint8Array(await certRes.arrayBuffer());
  writeFileSync(path.join(dir, "certificate.pdf"), pdf);
  const { pages, text, images } = await pdfImages(pdf.slice());
  const qrUrl = images.length === 1 ? jsQR(images[0].rgba, images[0].width, images[0].height)?.data : null;
  results.certificate_one_page = certRes.ok && pages === 1;
  results.certificate_qr_is_public_verify_url = qrUrl === info.public_verify_url;
  results.certificate_lists_tx_and_block = text.includes(info.anchor.polygon_tx_hash) && /Block\s+\d+, \d{4}-\d\d-\d\dT/.test(text);
  results.certificate_has_both_signature_blocks = text.includes("Part A: officer") && text.includes("Part B: expert");
  console.log(`QR: ${qrUrl}`);

  // Bundle, as the officer's "Download verification bundle" button builds it.
  const proof = await (await api("/proof", token)).json();
  const proofPath = path.join(dir, "verification-proof.json");
  writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  const pngPaths = [];
  for (const p of proof.pages) {
    const png = Buffer.from(await (await api(`/pages/${p.page_index}`, token)).arrayBuffer());
    pngPaths.push(path.join(dir, `page-${p.page_index}.png`));
    writeFileSync(pngPaths.at(-1), png);
  }

  const browser = await chromium.launch();
  try {
    // 2–3. Phone-sized, logged-out: scan → Anchored; drop files → Verified.
    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const page = await phone.newPage();
    logBrowserErrors(page, "phone");
    const apiCalls = [];
    page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/") && apiCalls.push(r.url()));
    await page.goto(qrUrl);
    const anchoredText = await waitForCertificateCheck(page);
    results.phone_qr_shows_anchored = anchoredText.includes("Anchored:") && anchoredText.includes("additionally requires dropping the document pages");
    await page.screenshot({ path: path.join(dir, "phone-1-anchored.png"), fullPage: true });

    await page.setInputFiles('input[accept="application/json"]', proofPath);
    await page.setInputFiles('input[accept="image/png"]', pngPaths);
    await page.click('button:has-text("Verify")');
    await page.waitForFunction(() => !document.body.innerText.includes("Checking blockchain record"), null, { timeout: 60000 });
    const verdict = await page.locator(".result-card.vf-ok h2").allInnerTexts();
    const body = await page.locator("body").innerText();
    results.phone_pages_turn_it_verified =
      verdict.includes("Verified - matches public blockchain record") && body.includes("the scanned certificate describes");
    results.portal_made_no_api_calls = apiCalls.length === 0;
    await page.waitForTimeout(400); // result card fade-in
    const official = await page.locator(".vf-official").boundingBox();
    const facts = await page.locator(".result-card.vf-ok .vf-facts").last().boundingBox();
    results.phone_layout_no_overlap = Boolean(official && facts && official.y >= facts.y + facts.height && official.x + official.width <= 412);
    await page.screenshot({ path: path.join(dir, "phone-2-verified.png"), fullPage: true });
    await phone.close();

    // 4. Altered commitment in the link.
    const forged = new URL(qrUrl);
    forged.searchParams.set("c", forged.searchParams.get("c").replace(/^./, (ch) => (ch === "0" ? "1" : "0")));
    const anon = await browser.newContext();
    const fpage = await anon.newPage();
    await fpage.goto(forged.toString());
    results.altered_commitment_refused = (await waitForCertificateCheck(fpage)).includes("does not match");
    await anon.close();

    // 5. Version page: the link and the statement, for the officer.
    const officer = await browser.newContext();
    const opage = await officer.newPage();
    await login(opage);
    await opage.goto(`${BASE}/dashboard/documents/${documentId}/versions/${versionId}`);
    const link = opage.getByTestId("certificate-verify-link");
    await link.waitFor({ timeout: 30000 });
    results.version_page_shows_link_and_statement =
      (await link.getAttribute("href")) === info.public_verify_url &&
      (await opage.locator("body").innerText()).includes("Scanning the QR code proves this certificate's commitment is anchored");
    await officer.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
  console.log(`Files and screenshots: ${dir}`);
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
