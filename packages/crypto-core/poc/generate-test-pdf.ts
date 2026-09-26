import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

/**
 * No real sample FIR scan exists in the repo yet (apps/web/public/sample-firs
 * is empty). For this POC we synthesize a multi-page, visually "messy"
 * document — dense text, a table grid, a rotated stamp, scattered
 * stain-like dots — so the render/tile/hash pipeline is exercised against
 * something closer to a real scan than a blank page. Swap for a real test
 * document in the step-7 integration pass.
 */
export async function generateMessyTestPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let p = 0; p < pageCount; p++) {
    const page = doc.addPage([595, 842]); // A4 in points
    const { width, height } = page.getSize();

    // Off-white scan-like background
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.98, 0.97, 0.94) });

    page.drawText("FIRST INFORMATION REPORT", {
      x: 50,
      y: height - 60,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(`(Under Section 154 Cr.P.C.)  —  Page ${p + 1} of ${pageCount}`, {
      x: 50,
      y: height - 80,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Dense paragraph filler, varied per page so pages aren't identical
    const lines = buildFillerLines(p, 30);
    let y = height - 110;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
      y -= 13;
      if (y < 120) break;
    }

    // Table grid (simulates a structured section of the form)
    const tableTop = 200;
    const tableLeft = 50;
    const tableWidth = width - 100;
    const rows = 6;
    const cols = 3;
    const rowH = 18;
    for (let r = 0; r <= rows; r++) {
      const yy = tableTop - r * rowH;
      page.drawLine({
        start: { x: tableLeft, y: yy },
        end: { x: tableLeft + tableWidth, y: yy },
        thickness: 0.75,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
    for (let c = 0; c <= cols; c++) {
      const xx = tableLeft + (c * tableWidth) / cols;
      page.drawLine({
        start: { x: xx, y: tableTop },
        end: { x: xx, y: tableTop - rows * rowH },
        thickness: 0.75,
        color: rgb(0.2, 0.2, 0.2),
      });
    }

    // Rotated "stamp" — simulates a physical stamp/annotation on a scan
    page.drawRectangle({
      x: width - 170,
      y: 40,
      width: 120,
      height: 50,
      borderColor: rgb(0.7, 0.1, 0.1),
      borderWidth: 2,
      rotate: degrees(-12),
    });
    page.drawText("VERIFIED COPY", {
      x: width - 160,
      y: 58,
      size: 11,
      font: fontBold,
      color: rgb(0.7, 0.1, 0.1),
      rotate: degrees(-12),
    });

    // Scattered low-opacity dots — simulates scan noise / coffee stains
    const rand = mulberry32(1000 + p);
    for (let i = 0; i < 150; i++) {
      const x = rand() * width;
      const yy = rand() * height;
      const r = 0.4 + rand() * 1.6;
      page.drawEllipse({
        x,
        y: yy,
        xScale: r,
        yScale: r,
        color: rgb(0.55, 0.45, 0.3),
        opacity: 0.15 + rand() * 0.2,
      });
    }
  }

  return doc.save();
}

function buildFillerLines(pageIndex: number, count: number): string[] {
  const words = [
    "complainant",
    "stated",
    "that",
    "on",
    "the",
    "night",
    "of",
    "incident",
    "occurred",
    "near",
    "the",
    "market",
    "area",
    "under",
    "jurisdiction",
    "of",
    "this",
    "police",
    "station",
    "witness",
    "confirmed",
    "the",
    "sequence",
    "of",
    "events",
    "as",
    "recorded",
    "below",
    "for",
    "further",
    "investigation",
    "and",
    "necessary",
    "action",
    "as",
    "per",
    "law",
  ];
  const rand = mulberry32(2000 + pageIndex);
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = 8 + Math.floor(rand() * 6);
    const line = Array.from({ length: len }, () => words[Math.floor(rand() * words.length)]).join(" ");
    lines.push(`${i + 1}. ${line}.`);
  }
  return lines;
}

/** Small deterministic PRNG so the "messy" doc is reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
