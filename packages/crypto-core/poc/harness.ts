import "./buffer-polyfill";

import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error -- Vite `?url` import, resolves to the built worker file's URL at build time.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { loadPdf, renderPageToPng } from "../src/render";
import { hashTiles } from "../src/tiles";
import { sha256, toHex, lengthPrefixedConcat } from "../src/hash";
import { buildMerkleTree, getProofForLeaf, verifyProof } from "../src/merkle";
import { hashDocument, DEFAULT_GRID_SIZE } from "../src/pipeline";
import { generateMessyTestPdf } from "./generate-test-pdf";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const params = new URLSearchParams(location.search);
const GRID_SIZE = Number(params.get("gridSize")) || DEFAULT_GRID_SIZE;
const SCALE = Number(params.get("scale")) || 2.0; // ~200dpi-ish for A4 at 72pt base
const PAGE_COUNT = Number(params.get("pages")) || 5;

type Phase = "render" | "tile" | "merkle" | "clientHash" | "pdfGen" | "pdfLoad";

function nowMB(bytes: number | undefined): number | null {
  return typeof bytes === "number" ? Math.round((bytes / 1024 / 1024) * 10) / 10 : null;
}

async function main() {
  const result: Record<string, unknown> = {};
  const timingsMs: Record<Phase, number> = {
    render: 0,
    tile: 0,
    merkle: 0,
    clientHash: 0,
    pdfGen: 0,
    pdfLoad: 0,
  };

  let peakHeapMB: number | null = null;
  const memSamples: number[] = [];
  const perfMemory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const sampler = perfMemory
    ? window.setInterval(() => {
        memSamples.push(perfMemory.usedJSHeapSize);
      }, 40)
    : null;

  try {
    // ---- Test C prep: single-page doc, used for the PNG round-trip test ----
    const t0 = performance.now();
    const singlePdfBytes = await generateMessyTestPdf(1);
    timingsMs.pdfGen += performance.now() - t0;

    const singleResult = await hashDocument(bufToArrayBuffer(singlePdfBytes), {
      gridSize: GRID_SIZE,
      scale: SCALE,
    });

    // Determinism check: same input -> same output, every time.
    const singleResultAgain = await hashDocument(bufToArrayBuffer(singlePdfBytes), {
      gridSize: GRID_SIZE,
      scale: SCALE,
    });
    const deterministic =
      singleResult.merkleRoot === singleResultAgain.merkleRoot &&
      singleResult.clientHash === singleResultAgain.clientHash;

    // ---- Test C: PNG round-trip. Decode the stored PNG back into a fresh
    // canvas (this is exactly what the Court Verification Portal does) and
    // confirm re-tiling + re-hashing from the DECODED PNG reproduces the
    // identical Merkle root, with no access to the original canvas. ----
    const pagePng = singleResult.pagePngBytes[0];
    const bitmap = await createImageBitmap(new Blob([bufToArrayBuffer(pagePng)], { type: "image/png" }));
    const roundTripCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const rtCtx = roundTripCanvas.getContext("2d")!;
    rtCtx.drawImage(bitmap, 0, 0);
    const roundTripTiles = await hashTiles(roundTripCanvas, 0, GRID_SIZE, 0);
    const { rootHex: roundTripRoot } = buildMerkleTree(roundTripTiles);
    const pngRoundTripMatches = roundTripRoot === singleResult.merkleRoot;

    // ---- Main perf/memory run: multi-page "messy" document ----
    const tGenStart = performance.now();
    const pdfBytes = await generateMessyTestPdf(PAGE_COUNT);
    timingsMs.pdfGen += performance.now() - tGenStart;

    const tLoadStart = performance.now();
    const pdf = await loadPdf(bufToArrayBuffer(pdfBytes));
    timingsMs.pdfLoad = performance.now() - tLoadStart;

    const pageCanvases: (OffscreenCanvas | HTMLCanvasElement)[] = [];
    const pagePngSizes: number[] = [];
    const allTiles = [];
    let totalTileCount = 0;

    for (let i = 0; i < pdf.numPages; i++) {
      const tRenderStart = performance.now();
      const { raster, canvas } = await renderPageToPng(pdf, i, SCALE);
      timingsMs.render += performance.now() - tRenderStart;
      pagePngSizes.push(raster.pngBytes.byteLength);
      pageCanvases.push(canvas);

      const tTileStart = performance.now();
      const tiles = await hashTiles(canvas, i, GRID_SIZE, i * GRID_SIZE * GRID_SIZE);
      timingsMs.tile += performance.now() - tTileStart;

      allTiles.push(...tiles);
      totalTileCount += tiles.length;
    }

    const tMerkleStart = performance.now();
    const { tree: mainTree, rootHex: mainRoot } = buildMerkleTree(allTiles);
    timingsMs.merkle = performance.now() - tMerkleStart;

    // client_hash isn't needed again here (already validated via
    // hashDocument above) — skip recomputation in the perf loop.

    // ---- Test A: tamper detection on a REAL rendered tile ----
    // Mutate a 6x6px black square inside page 0's tile (row=2,col=2), on
    // the actual canvas pixels, then re-tile just that page and confirm:
    //   1. the mutated tile's hash changed
    //   2. every OTHER tile's hash on that page is untouched
    //   3. the whole-document Merkle root changed
    const page0Canvas = pageCanvases[0];
    const p0Ctx = page0Canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const tileW = Math.ceil(page0Canvas.width / GRID_SIZE);
    const tileH = Math.ceil(page0Canvas.height / GRID_SIZE);
    const tamperRow = 2;
    const tamperCol = 2;
    p0Ctx.fillStyle = "black";
    p0Ctx.fillRect(tamperCol * tileW + 4, tamperRow * tileH + 4, 6, 6);

    const page0TilesAfter = await hashTiles(page0Canvas, 0, GRID_SIZE, 0);
    const page0TilesBefore = allTiles.filter((t) => t.pageIndex === 0);

    let changedCount = 0;
    let unexpectedlyChanged = 0;
    for (let i = 0; i < page0TilesBefore.length; i++) {
      const before = page0TilesBefore[i];
      const after = page0TilesAfter[i];
      const isTamperedTile = before.row === tamperRow && before.col === tamperCol;
      const changed = before.hashHex !== after.hashHex;
      if (isTamperedTile) {
        if (changed) changedCount++;
      } else if (changed) {
        unexpectedlyChanged++;
      }
    }
    const tileHashChangedCorrectly = changedCount === 1 && unexpectedlyChanged === 0;

    const tamperedAllTiles = allTiles.map((t) => {
      const replacement = page0TilesAfter.find(
        (a) => a.pageIndex === t.pageIndex && a.row === t.row && a.col === t.col
      );
      return t.pageIndex === 0 && replacement ? replacement : t;
    });
    const { rootHex: tamperedRoot } = buildMerkleTree(tamperedAllTiles);
    const rootChangedAfterTamper = tamperedRoot !== mainRoot;

    // ---- Test B: Merkle proof still verifies for an untampered tile,
    // against the ORIGINAL (pre-tamper) root — the realistic scenario of
    // proving an untouched tile belongs to an already-anchored version. ----
    const untamperedLeaf = allTiles.find((t) => !(t.pageIndex === 0 && t.row === tamperRow && t.col === tamperCol))!;
    const proof = getProofForLeaf(mainTree, untamperedLeaf.hashHex);
    const proofVerifiesAgainstOriginalRoot = verifyProof(mainTree, proof, untamperedLeaf.hashHex, mainRoot);
    // Sanity: the same proof must NOT verify against the tampered root.
    const proofFailsAgainstTamperedRoot = !verifyProof(mainTree, proof, untamperedLeaf.hashHex, tamperedRoot);

    if (sampler !== null) window.clearInterval(sampler);
    peakHeapMB = memSamples.length ? nowMB(Math.max(...memSamples)) : null;

    result.status = "ok";
    result.gridSize = GRID_SIZE;
    result.scale = SCALE;
    result.pageCount = pdf.numPages;
    result.totalTileCount = totalTileCount;
    result.pagePngSizesKB = pagePngSizes.map((b) => Math.round(b / 1024));
    result.timingsMs = roundTimings(timingsMs);
    result.totalPipelineMs = Math.round(
      timingsMs.render + timingsMs.tile + timingsMs.merkle + timingsMs.clientHash
    );
    result.avgMsPerTile = Math.round(((timingsMs.tile / totalTileCount) * 1000) / 10) / 100;
    result.peakHeapMB = peakHeapMB;
    result.memoryApiAvailable = !!perfMemory;
    result.mainMerkleRoot = mainRoot;
    result.tests = {
      determinism_sameInputSameOutput: deterministic,
      pngRoundTrip_verifierCanRecomputeRootFromPngAlone: pngRoundTripMatches,
      tamperTest_exactlyOneTileHashChanged: tileHashChangedCorrectly,
      tamperTest_rootChangedAfterTamper: rootChangedAfterTamper,
      proofTest_untamperedTileProvesAgainstOriginalRoot: proofVerifiesAgainstOriginalRoot,
      proofTest_sameProofFailsAgainstTamperedRoot: proofFailsAgainstTamperedRoot,
    };
    result.allTestsPassed = Object.values(result.tests as Record<string, boolean>).every(Boolean);
  } catch (err) {
    if (sampler !== null) window.clearInterval(sampler);
    result.status = "error";
    result.error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  }

  const pre = document.createElement("pre");
  pre.id = "result";
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
  document.body.setAttribute("data-status", (result.status as string) ?? "error");
  console.log("POC_RESULT_JSON", JSON.stringify(result));
}

function roundTimings(t: Record<Phase, number>): Record<Phase, number> {
  const out = {} as Record<Phase, number>;
  for (const k of Object.keys(t) as Phase[]) out[k] = Math.round(t[k] * 10) / 10;
  return out;
}

function bufToArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

main();
