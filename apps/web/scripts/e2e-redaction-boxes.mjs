// End-to-end check of redaction suggestions in the real UI against the
// current apps/ai-service (docs/07 Phase 8, ADR-033/034). Per language:
//   1. Upload a synthetic FIR page (from the Phase 6 test set, gold labels
//      known) through the UI. Every box drawn on the version page must sit
//      exactly on a suggested tile, and the suggestions must cover the
//      identifiers on the page.
//   2. Confirm every suggestion (PIN step-up): the names join the case
//      gazetteer.
//   3. Upload the case's follow-up statement, where the same people appear
//      with no labels. Its names must be suggested, from the gazetteer.
//
// Prereqs: seeded users (prisma/seed-for-testing.mjs); apps/ai-service on
// AI_SERVICE_URL with the current code; the web app started with a
// GAZETTEER_KEY; the Phase 6 test set (`pnpm eval:redaction`, or
// `.venv/bin/python -m eval.generate` in apps/ai-service).
// Each language uploads twice and confirms once: 3 Amoy anchors (~0.009 POL; ~0.028 for all three).
//
//   E2E_DOCS=en-04,hi-02,kn-03 E2E_FORM=clean node scripts/e2e-redaction-boxes.mjs
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASE, SCRIPTS_DIR, login, createAndOpenCase, uploadDocument, logBrowserErrors, stepUpWithPin } from "./e2e-helpers.mjs";

const SET = path.join(SCRIPTS_DIR, "..", "..", "ai-service", "eval", "out");
const DOCS = (process.env.E2E_DOCS ?? "en-04,hi-02,kn-03").split(",");
const FORM = process.env.E2E_FORM ?? "clean";
const OUT = mkdtempSync(path.join(tmpdir(), "dv-boxes-"));

/** One A4 page (595x842 pt) holding the PNG, so PDF.js at scale 2.0 renders it back at 1190x1684. */
async function pdfOf(pngPath, name) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawImage(await doc.embedPng(readFileSync(pngPath)), { x: 0, y: 0, width: 595, height: 842 });
  const out = path.join(OUT, name);
  writeFileSync(out, await doc.save());
  return out;
}

async function suggestions(page) {
  const [, , , documentId, , versionId] = new URL(page.url()).pathname.split("/");
  return page.evaluate(async ([d, v]) => {
    const { token } = JSON.parse(localStorage.getItem("digivault_session"));
    const res = await fetch(`/api/v1/documents/${d}/versions/${v}/redaction-suggestions`, { headers: { Authorization: `Bearer ${token}` } });
    return (await res.json()).suggestions;
  }, [documentId, versionId]);
}

/** Every drawn box, as the tile its on-screen position falls on (checked to within 1 px). */
async function drawnTiles(page, grid) {
  await page.locator(".wsv-page img").first().waitFor();
  return page.evaluate((g) => {
    const wrap = document.querySelector(".wsv-page");
    const img = wrap.querySelector("img");
    const pr = img.getBoundingClientRect();
    const tw = Math.ceil(img.naturalWidth / g) * (pr.width / img.naturalWidth);
    const th = Math.ceil(img.naturalHeight / g) * (pr.height / img.naturalHeight);
    return [...wrap.querySelectorAll(".wsv-tile")].map((el) => {
      const r = el.getBoundingClientRect();
      const col = Math.round((r.left - pr.left) / tw);
      const row = Math.round((r.top - pr.top) / th);
      const aligned = Math.abs(r.left - pr.left - col * tw) <= 1 && Math.abs(r.top - pr.top - row * th) <= 1;
      return { tile: row * g + col, aligned };
    });
  }, grid);
}

/** Tiles touched only by the printed title or footer (no identifier or other content on them). */
function titleFooterTiles(page) {
  const content = new Set([...page.entities, ...page.ignore].flatMap((e) => e.tiles));
  return new Set((page.form_text ?? []).filter((e) => e.type === "title" || e.type === "footer").flatMap((e) => e.tiles).filter((t) => !content.has(t)));
}

function coverage(entities, flagged) {
  const caught = entities.filter((e) => e.tiles.every((t) => flagged.has(t)));
  const missed = entities.filter((e) => !e.tiles.every((t) => flagged.has(t))).map((e) => `${e.type}:${e.text}`);
  return { caught: caught.length, total: entities.length, missed };
}

async function selectAllAndConfirm(page) {
  const v1 = page.url();
  for (const box of await page.locator("li input[type=checkbox]").all()) await box.check();
  await page.locator("button", { hasText: /^Review \d+ selected areas?$/ }).click();
  await page.click('button:has-text("Create redacted version")');
  await stepUpWithPin()(page);
  await page.waitForFunction((old) => window.location.href !== old, v1, { timeout: 60000 });
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(SET, "manifest.json"), "utf8"));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1800 } });
  const page = await ctx.newPage();
  logBrowserErrors(page);
  await login(page);
  const results = [];

  for (const docId of DOCS) {
    const fir = manifest.pages.find((p) => p.doc_id === docId && p.form === FORM);
    const fu = manifest.followups.find((p) => p.doc_id === docId && p.form === FORM);
    if (!fir || !fu) throw new Error(`${docId}/${FORM} is not in ${SET}/manifest.json`);
    const r = { doc: `${docId} ${FORM}` };

    await page.goto(`${BASE}/dashboard`);
    r.case = await createAndOpenCase(page, `E2E-BOX-${docId.toUpperCase()}`);
    const caseUrl = page.url();
    await uploadDocument(page, await pdfOf(path.join(SET, fir.path), `${docId}-fir.pdf`), `Synthetic FIR ${docId}`);
    const firSugg = await suggestions(page);
    const drawn = await drawnTiles(page, fir.grid);
    const suggested = new Set(firSugg.filter((s) => !s.masked).map((s) => s.tile_index));
    r.fir_boxes_drawn = drawn.length;
    r.fir_boxes_on_suggested_tiles = drawn.every((d) => d.aligned && suggested.has(d.tile)) && drawn.length === suggested.size;
    r.fir_coverage = coverage(fir.entities, suggested);
    const firForm = titleFooterTiles(fir);
    if (firForm.size === 0) throw new Error("manifest has no form_text; regenerate the test set");
    r.fir_boxes_on_title_or_footer = drawn.filter((d) => firForm.has(d.tile)).length;
    await page.screenshot({ path: path.join(OUT, `${docId}-fir.png`), fullPage: true });

    await selectAllAndConfirm(page);
    await page.goto(caseUrl);
    await uploadDocument(page, await pdfOf(path.join(SET, fu.path), `${docId}-followup.pdf`), `Follow-up statement ${docId}`);
    const fuSugg = await suggestions(page);
    const fuTiles = new Set(fuSugg.map((s) => s.tile_index));
    r.followup_gazetteer_suggestions = fuSugg.filter((s) => s.source === "gazetteer").length;
    r.followup_coverage = coverage(fu.entities, fuTiles);
    const fuDrawn = await drawnTiles(page, fu.grid);
    r.followup_boxes_on_suggested_tiles = fuDrawn.every((d) => d.aligned && fuTiles.has(d.tile)) && fuDrawn.length === fuTiles.size;
    const fuForm = titleFooterTiles(fu);
    r.followup_boxes_on_title_or_footer = fuDrawn.filter((d) => fuForm.has(d.tile)).length;
    await page.screenshot({ path: path.join(OUT, `${docId}-followup.png`), fullPage: true });

    console.log(JSON.stringify(r));
    results.push(r);
  }
  await browser.close();

  const ok = results.every(
    (r) =>
      r.fir_boxes_on_suggested_tiles &&
      r.followup_boxes_on_suggested_tiles &&
      r.followup_gazetteer_suggestions > 0 &&
      r.fir_boxes_on_title_or_footer === 0 &&
      r.followup_boxes_on_title_or_footer === 0
  );
  console.log(`\nscreenshots: ${OUT}`);
  console.log(ok ? "PASS: boxes line up with suggestions, none on the title or footer; gazetteer flags follow-up names" : "FAIL: see above");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
