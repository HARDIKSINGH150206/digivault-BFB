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
import sharp from "sharp";
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
  const text = await verifyPage.locator(".result-card").innerText();
  await anonCtx.close();
  return { verdict, officialLabel, detail, text };
}

/** Rewrites a PNG with one pixel set to `rgba`. */
async function withPixel(pngPath, x, y, rgba, outPath) {
  const { data, info } = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  data.set(rgba, (y * info.width + x) * 4);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(outPath);
  return outPath;
}

function tileOrigin(proof, page, k) {
  const p = proof.pages[page];
  const tileW = Math.ceil(p.width / proof.gridSize);
  const tileH = Math.ceil(p.height / proof.gridSize);
  return { x: (k % proof.gridSize) * tileW + 1, y: Math.floor(k / proof.gridSize) * tileH + 1 };
}

/** The genuine redacted copy verifies against the original anchor; the three tamper cases fail, naming what changed. */
async function checkRedactionProofInPortal(browser, pngPaths, proofPath, dir) {
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  const pages = [...pngPaths].sort();
  const out = {};

  const genuine = await verifyInPortal(browser, pages, proofPath);
  console.log("STEP: redaction proof (genuine) ->", genuine.verdict);
  const masked = proof.pages[0].masked.length;
  out.genuine_verifies = genuine.verdict.startsWith("Verified redacted copy") && genuine.officialLabel;
  out.genuine_counts_tiles = genuine.text.includes(`${400 - masked} of 400 tiles on page 1 are byte-identical`) && genuine.text.includes(`${masked} masked`);

  // Edit one unmasked pixel -> fail naming the tile.
  const unmaskedK = Array.from({ length: 400 }, (_, k) => k).find((k) => !proof.pages[0].masked.includes(k) && k > 20);
  const u = tileOrigin(proof, 0, unmaskedK);
  const editedPng = await withPixel(pages[0], u.x, u.y, [1, 2, 3, 255], path.join(dir, "edited-page-0.png"));
  const edited = await verifyInPortal(browser, [editedPng, ...pages.slice(1)], proofPath);
  const name = `page 1 row ${Math.floor(unmaskedK / 20) + 1} col ${(unmaskedK % 20) + 1}`;
  console.log("STEP: redaction proof (edited unmasked pixel) ->", edited.verdict, "|", edited.text.split("\n").find((l) => l.includes("differ")));
  out.edited_pixel_fails_naming_tile = edited.verdict.startsWith("Mismatch") && edited.text.includes(name);

  // Change a masked leaf in the proof -> fail.
  const forged = JSON.parse(JSON.stringify(proof));
  forged.pages[0].originalLeaves[forged.pages[0].masked[0]] = "00".repeat(32);
  const forgedPath = path.join(dir, "forged-redaction-proof.json");
  writeFileSync(forgedPath, JSON.stringify(forged));
  const leaf = await verifyInPortal(browser, pages, forgedPath);
  console.log("STEP: redaction proof (changed masked leaf) ->", leaf.verdict);
  out.changed_masked_leaf_fails = leaf.verdict.startsWith("Mismatch") && leaf.text.includes("do not rebuild the original");

  // Non-mask pixels inside a masked tile -> fail.
  const m = tileOrigin(proof, 0, proof.pages[0].masked[0]);
  const peekPng = await withPixel(pages[0], m.x, m.y, [220, 30, 30, 255], path.join(dir, "peek-page-0.png"));
  const peek = await verifyInPortal(browser, [peekPng, ...pages.slice(1)], proofPath);
  console.log("STEP: redaction proof (content inside a masked tile) ->", peek.verdict);
  out.content_in_masked_tile_fails = peek.verdict.startsWith("Mismatch") && peek.text.includes("other than the solid mask colour");
  return out;
}

/**
 * A share-link recipient (no account, fresh context) downloads the
 * verification files from the share page and verifies them at /verify. The
 * page PNGs must be byte-identical to the officer's.
 */
async function checkShareLinkInPortal(browser, shareToken, officerPngPaths, dir) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  logBrowserErrors(page, "recipient");
  await page.goto(`${BASE}/shares/${shareToken}`);
  const downloads = [];
  page.on("download", (d) => downloads.push(d));
  await page.click('button:has-text("Download verification files")');
  await page.locator("text=Open the verification page and add them").waitFor({ timeout: 60000 });
  const shareDir = mkdtempSync(path.join(dir, "share-"));
  const saved = [];
  for (const d of downloads) {
    const dest = path.join(shareDir, d.suggestedFilename());
    await d.saveAs(dest);
    saved.push(dest);
  }
  await ctx.close();
  console.log("STEP: share-link verification files ->", saved.map((p) => path.basename(p)));

  const proofPath = saved.find((p) => p.endsWith("redaction-proof.json"));
  const pngs = saved.filter((p) => p.endsWith(".png")).sort();
  const officer = [...officerPngPaths].sort();
  const out = {
    share_files_complete: Boolean(proofPath) && pngs.length === officer.length,
    share_pngs_match_officer: pngs.length === officer.length && pngs.every((p, i) => readFileSync(p).equals(readFileSync(officer[i]))),
  };
  const result = proofPath ? await verifyInPortal(browser, pngs, proofPath) : { verdict: "no proof downloaded" };
  console.log("STEP: portal verdict (share-link files) ->", result.verdict);
  out.share_files_verify = result.verdict.startsWith("Verified redacted copy");
  return out;
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

  // Redaction proof (Phase 3): its own download, never bundled with the original's proof.
  const [redactionDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click('button:has-text("Download redaction proof")'),
  ]);
  const redactionProofPath = path.join(downloadDir, redactionDownload.suggestedFilename());
  await redactionDownload.saveAs(redactionProofPath);
  console.log("STEP: redaction proof saved ->", path.basename(redactionProofPath));

  // A share link for the recipient check below (docs/04 §7).
  const documentId = new URL(page.url()).pathname.split("/")[3];
  const share = await page.evaluate(async (documentId) => {
    const { token } = JSON.parse(localStorage.getItem("digivault_session"));
    const res = await fetch(`/api/v1/documents/${documentId}/shares`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipientLabel: "E2E recipient", expiresAt: new Date(Date.now() + 86400000).toISOString(), maxViews: 3 }),
    });
    return res.json();
  }, documentId);
  if (!share.token) throw new Error(`Could not create a share link: ${JSON.stringify(share)}`);
  await officerCtx.close();

  const proofPath = savedPaths.find((p) => p.endsWith("verification-proof.json"));
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

  // --- Unauthenticated: redaction proof against the ORIGINAL's anchor ---
  const redaction = await checkRedactionProofInPortal(browser, pngPaths, redactionProofPath, downloadDir);
  Object.assign(redaction, await checkShareLinkInPortal(browser, share.token, pngPaths, downloadDir));

  await browser.close();
  console.log(JSON.stringify({ genuine: genuine.verdict, forged: forgedResult.verdict, redaction, downloadDir }));
  if (!Object.values(redaction).every(Boolean)) process.exit(1);

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
