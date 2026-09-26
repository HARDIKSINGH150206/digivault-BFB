import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageRaster } from "./types";

/**
 * PDF.js rendering worker must be configured by the host app/harness before
 * calling loadPdf — see poc/harness.ts for the Vite `?url` wiring. crypto-core
 * itself stays bundler-agnostic and does not set GlobalWorkerOptions.
 */

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({ data });
  return task.promise;
}

/**
 * Renders one page to an offscreen canvas and exports it as lossless PNG.
 * PNG only — never JPEG or any lossy encoding, per CLAUDE.md rule 1.
 */
export async function renderPageToPng(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  scale: number
): Promise<{ raster: PageRaster; canvas: OffscreenCanvas | HTMLCanvasElement }> {
  const page = await pdf.getPage(pageIndex + 1); // pdf.js pages are 1-indexed
  const viewport = page.getViewport({ scale });

  const widthPx = Math.ceil(viewport.width);
  const heightPx = Math.ceil(viewport.height);

  const canvas = makeCanvas(widthPx, heightPx);
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;

  const pngBytes = await canvasToPngBytes(canvas);

  return {
    raster: { pageIndex, widthPx, heightPx, pngBytes },
    canvas,
  };
}

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToPngBytes(
  canvas: OffscreenCanvas | HTMLCanvasElement
): Promise<Uint8Array> {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}
