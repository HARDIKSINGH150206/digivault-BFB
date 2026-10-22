// Cross-browser check of the hashing the Court Verification Portal relies on
// (docs/07 Phase 8): Chromium, Firefox and WebKit must compute identical
// roots and commitments.
//
//   1. Test vectors: packages/crypto-core (bundled with esbuild) runs inside
//      each engine, on the /verify origin (a secure context, so WebCrypto is
//      used), over the v2 vectors in packages/crypto-core/test/vectors.json.
//      Inputs are built in Node with the vector rules; outputs are compared
//      with the committed values.
//   2. A real anchored document: its verification bundle and redaction proof
//      are dropped into /verify in each engine. Each must say "Verified" and
//      "Verified redacted copy" against Polygon Amoy, and, for a page with one
//      pixel changed, "Mismatch" with the same recomputed value.
//
// Prereqs: web app on E2E_BASE_URL with a reachable AMOY_RPC_URL; Playwright
// Chromium, Firefox and WebKit installed. No gas.
//
//   node scripts/e2e-three-browsers.mjs [files-dir]
// files-dir holds verification-proof.json, page-*.png and redaction-proof.json
// from the same redacted version (default: the newest golden-path run's
// folder, /tmp/dv-golden-*).
import { chromium, firefox, webkit } from "playwright";
import { build } from "esbuild";
import sharp from "sharp";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BASE, SCRIPTS_DIR } from "./e2e-helpers.mjs";

const CORE = path.join(SCRIPTS_DIR, "..", "..", "..", "packages", "crypto-core");
const ALL_ENGINES = { chromium, firefox, webkit };
// E2E_ENGINES=chromium,firefox runs a subset (e.g. while WebKit's system
// libraries are missing); the run then says it did not cover all three.
const ENGINES = Object.fromEntries(
  (process.env.E2E_ENGINES ?? "chromium,firefox,webkit").split(",").map((n) => [n.trim(), ALL_ENGINES[n.trim()]])
);

async function coreBundle() {
  const out = await build({
    stdin: {
      contents: `import { computeDocumentV2 } from "./src/dv2.ts";
        const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
        window.dvVector = async (v) => {
          const pages = v.pages.map((p, i) => ({ pageIndex: i, width: p.width, height: p.height, rgba: b64(p.rgba) }));
          const r = await computeDocumentV2(pages, v.pngs.map(b64), v.gridSize, v.salts.map(b64));
          return { leaves: r.tiles.map((t) => t.hashHex), pageRoots: r.pageRoots, documentRoot: r.documentRoot,
                   fileHash: r.fileHash, commitment: r.commitment,
                   webcrypto: typeof crypto !== "undefined" && !!crypto.subtle };
        };`,
      resolveDir: CORE,
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  return out.outputFiles[0].text;
}

async function vectorInputs() {
  const vectors = JSON.parse(readFileSync(path.join(CORE, "test", "vectors.json"), "utf8"));
  const { vectorPng, vectorRgba, vectorSalt } = await import(path.join(CORE, "reference", "gen-vectors.mjs"));
  const b64 = (u) => Buffer.from(u).toString("base64");
  return vectors.documents.map((d) => ({
    name: d.name,
    expected: d,
    input: {
      gridSize: d.gridSize,
      pages: d.pages.map((p, i) => ({ width: p.width, height: p.height, rgba: b64(vectorRgba(p.width, p.height, i)) })),
      pngs: d.pages.map((_, i) => b64(vectorPng(i))),
      salts: d.leaves.map((_, i) => b64(vectorSalt(i))),
    },
  }));
}

function filesDir() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const dirs = readdirSync(tmpdir())
    .filter((d) => d.startsWith("dv-golden-"))
    .map((d) => path.join(tmpdir(), d))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dirs.length) throw new Error("no files dir given and no /tmp/dv-golden-* folder: run scripts/golden-path.mjs first");
  return dirs[0];
}

async function portal(browser, proof, pngs) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const apiCalls = [];
  page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/") && apiCalls.push(r.url()));
  await page.goto(`${BASE}/verify`);
  await page.setInputFiles('input[accept="application/json"]', proof);
  await page.setInputFiles('input[accept="image/png"]', pngs);
  await page.click('button:has-text("Verify")');
  await page.waitForFunction(() => !document.body.innerText.includes("Checking blockchain record"), null, { timeout: 90000 });
  const verdict = ((await page.locator(".result-card h2").first().textContent()) ?? "").trim();
  const text = await page.locator(".result-card").first().innerText();
  await ctx.close();
  if (apiCalls.length) throw new Error(`/verify called the app's API: ${apiCalls.join(", ")}`);
  const recomputed = [...text.matchAll(/recomputed=([0-9a-f]{64})/g)].map((m) => m[1]);
  return { verdict, recomputed };
}

async function main() {
  const dir = filesDir();
  const names = readdirSync(dir);
  const bundleProof = path.join(dir, "verification-proof.json");
  const redactionProof = path.join(dir, "redaction-proof.json");
  const pngs = names.filter((n) => /^page-\d+\.png$/.test(n)).sort().map((n) => path.join(dir, n));
  if (!pngs.length || !names.includes("verification-proof.json") || !names.includes("redaction-proof.json")) {
    throw new Error(`${dir} lacks verification-proof.json, redaction-proof.json or page-*.png`);
  }
  const tmp = mkdtempSync(path.join(tmpdir(), "dv-3b-"));
  const { data, info } = await sharp(pngs[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  data[0] ^= 0xff;
  const tampered = path.join(tmp, path.basename(pngs[0]));
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(tampered);

  const js = await coreBundle();
  const vectors = await vectorInputs();
  console.log(`files: ${dir}\nvectors: ${vectors.map((v) => v.name).join(", ")}\n`);

  const rows = {};
  for (const [name, engine] of Object.entries(ENGINES)) {
    const browser = await engine.launch();
    const r = { vectors: [], webcrypto: null };
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${BASE}/verify`);
      await page.addScriptTag({ content: js });
      for (const v of vectors) {
        const out = await page.evaluate((input) => window.dvVector(input), v.input);
        r.webcrypto = out.webcrypto;
        const e = v.expected;
        const same = JSON.stringify(out.leaves) === JSON.stringify(e.leaves) && JSON.stringify(out.pageRoots) === JSON.stringify(e.pageRoots)
          && out.documentRoot === e.documentRoot && out.fileHash === e.fileHash && out.commitment === e.commitment;
        r.vectors.push({ name: v.name, same, commitment: out.commitment });
      }
      r.bundle = await portal(browser, bundleProof, pngs);
      r.redaction = await portal(browser, redactionProof, pngs);
      r.tampered = await portal(browser, bundleProof, [tampered, ...pngs.slice(1)]);
    } finally {
      await browser.close();
    }
    rows[name] = r;
    console.log(`${name.padEnd(9)} vectors ${r.vectors.filter((x) => x.same).length}/${r.vectors.length}  WebCrypto ${r.webcrypto}  bundle "${r.bundle.verdict.slice(0, 40)}"  redaction "${r.redaction.verdict.slice(0, 40)}"  tampered "${r.tampered.verdict.slice(0, 20)}" ${r.tampered.recomputed[0]?.slice(0, 16) ?? "-"}`);
  }

  const all = Object.values(rows);
  const checks = {
    vectors_match_in_every_engine: all.every((r) => r.vectors.every((v) => v.same)),
    webcrypto_used_in_every_engine: all.every((r) => r.webcrypto === true),
    bundle_verified_in_every_engine: all.every((r) => r.bundle.verdict.startsWith("Verified")),
    redaction_verified_in_every_engine: all.every((r) => r.redaction.verdict.startsWith("Verified redacted copy")),
    tampered_mismatch_in_every_engine: all.every((r) => r.tampered.verdict.startsWith("Mismatch")),
    tampered_recomputed_identical: new Set(all.map((r) => r.tampered.recomputed.join(","))).size === 1 && all[0].tampered.recomputed.length > 0,
  };
  checks.all_three_engines_ran = Object.keys(rows).length === 3;
  console.log("\n" + Object.entries(checks).map(([k, v]) => `${v ? "PASS" : "FAIL"}  ${k}`).join("\n"));
  process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
