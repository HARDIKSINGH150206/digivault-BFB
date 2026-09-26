// Shared steps for the e2e-part*.mjs Playwright scripts. Credentials are the
// ones prisma/seed-for-testing.mjs creates; run that first.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

export const INVESTIGATING_OFFICER = { serviceNumber: "DL/2019/3301", pin: "223344" };

/**
 * A PDF with text the AI service reliably flags (a name, a phone number),
 * so the redaction-suggestion step has something to select.
 */
export async function makeTestPdf(fileName, title, pageCount = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${title} — page ${i + 1}`, { x: 50, y: 780, size: 16, font });
    page.drawText("Complainant Priya Sharma stated the incident occurred near the market area.", { x: 50, y: 740, size: 11, font });
    page.drawText("Contact number of the complainant: 9876543210.", { x: 50, y: 720, size: 11, font });
  }
  const outPath = path.join(SCRIPTS_DIR, fileName);
  writeFileSync(outPath, await doc.save());
  return outPath;
}

export function logBrowserErrors(page, tag = "browser") {
  page.on("pageerror", (err) => console.error(`[${tag}:pageerror]`, err));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error(`[${tag}:console:error]`, msg.text());
  });
}

export async function login(page, { serviceNumber, pin } = INVESTIGATING_OFFICER) {
  await page.goto(`${BASE}/login`);
  await page.fill("#service-number", serviceNumber);
  await page.fill("#pin", pin);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
}

/** Creates a case from the dashboard and opens it. Returns the case number. */
export async function createAndOpenCase(page, prefix) {
  const caseNumber = `${prefix}/${Date.now()}`;
  await page.click('button:has-text("+ New Case")');
  await page.fill('input[placeholder^="Case number"]', caseNumber);
  await page.fill('input[placeholder="Case type"]', "FIR");
  await page.fill('input[placeholder="Department"]', "Women Safety Division");
  await page.click('button:has-text("Create case")');
  const row = page.locator("tr", { hasText: caseNumber });
  await row.waitFor({ timeout: 15000 });
  await row.locator("a", { hasText: "View" }).click();
  await page.waitForURL(/\/dashboard\/cases\/[^/]+$/, { timeout: 15000 });
  return caseNumber;
}

/** Uploads a PDF from the open case page; resolves on the new version page. */
export async function uploadDocument(page, pdfPath, title) {
  await page.click('button:has-text("+ Upload Document")');
  await page.waitForURL(/\/upload$/, { timeout: 15000 });
  await page.fill('input[placeholder="e.g. FIR Report"]', title);
  await page.setInputFiles('input[type="file"]', pdfPath);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard\/documents\/.+\/versions\/.+$/, { timeout: 60000 });
  return page.url();
}

/** Selects the first AI suggestion and finalizes it. Resolves on the redacted version's page. */
export async function confirmFirstSuggestion(page, stepUp) {
  const v1Url = page.url();
  try {
    await page.waitForSelector("li input[type=checkbox]", { timeout: 30000 });
  } catch {
    throw new Error("No AI redaction suggestions appeared — is apps/ai-service running (AI_SERVICE_URL)?");
  }
  await page.locator("li input[type=checkbox]").first().check();
  await page.click('button:has-text("Review 1 selected redaction")');
  await page.click('button:has-text("Yes, finalize redactions")');
  await stepUp(page);
  await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, v1Url, { timeout: 30000 });
  return page.url();
}

/** Anchoring is automatic; wait for the indicator to settle. Returns "ANCHORED" or "FAILED". */
export async function waitForAnchor(page, timeout = 120000) {
  const settled = page.locator("text=/ANCHORED to Polygon Amoy|FAILED — not anchored|Anchoring did not complete/");
  await settled.first().waitFor({ timeout });
  const text = await settled.first().textContent();
  return text.includes("ANCHORED to Polygon") ? "ANCHORED" : "FAILED";
}

// --- Step-up ("Verify your identity") ---------------------------------------

/**
 * Gives the page a platform authenticator with a passing fingerprint /
 * Face ID check, via Chrome DevTools' WebAuthn domain.
 */
export async function addVirtualAuthenticator(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
}

/** Passes the dialog with WebAuthn, enrolling (with the PIN) the first time. */
export function stepUpWithBiometric(pin = INVESTIGATING_OFFICER.pin) {
  return async (page) => {
    await page.waitForSelector("text=Verify your identity");
    await page.click('[role=dialog] button:has-text("Use fingerprint / Face ID")');
    const enroll = page.locator("text=No fingerprint / Face ID is set up");
    const closed = page.locator("text=Verify your identity");
    await Promise.race([enroll.waitFor(), closed.waitFor({ state: "detached" })]);
    if (await enroll.isVisible().catch(() => false)) {
      await page.fill("#step-up-pin", pin);
      await page.click('button:has-text("Register fingerprint / Face ID")');
    }
    await closed.waitFor({ state: "detached", timeout: 30000 });
  };
}

/** Passes the dialog with the PIN fallback. */
export function stepUpWithPin(pin = INVESTIGATING_OFFICER.pin) {
  return async (page) => {
    await page.waitForSelector("text=Verify your identity");
    const usePin = page.locator('[role=dialog] button:has-text("Use PIN instead")');
    if (await usePin.isVisible().catch(() => false)) await usePin.click();
    await page.fill("#step-up-pin", pin);
    await page.click('button:has-text("Verify PIN")');
    await page.locator("text=Verify your identity").waitFor({ state: "detached", timeout: 30000 });
  };
}
