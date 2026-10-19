import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { CERTIFICATE_QR_STATEMENT } from "./certificate-text";

/**
 * BSA s.63 certificate PDF (docs/07 Phase 5). Pre-filled and unsigned:
 * software never self-certifies (docs/01), so it carries blank signature
 * blocks for the officer (Part A) and the expert (Part B).
 *
 * The QR opens the public, chain-only check (ADR-022: lib/public-proof.ts
 * publicVerifyUrl). It is only drawn once the version is anchored.
 */
export interface CertificateInput {
  caseNumber: string;
  documentTitle: string;
  versionNo: number;
  proofVersion: number;
  gridSize: number;
  /** lib/proof-v2.ts anchoredValue(): C for v2, the Merkle root for v1. */
  anchoredValue: string;
  /** v2 document root R (DocumentVersion.merkleRoot). Ignored for v1. */
  documentRoot: string;
  fileHash: string;
  chainHash: string;
  previousHash: string | null;
  anchor: {
    txHash: string;
    contractAddress: string;
    objectLockUri: string;
    /** From the chain; null if it couldn't be read when generating. */
    block: { number: number; time: Date } | null;
    /** When the server recorded the anchor (fallback for the block time). */
    recordedAt: Date;
  } | null;
  verifyUrl: string | null;
  generatedAt: Date;
  generatedForRole: string;
}

const A4: [number, number] = [595, 842];
const LEFT = 50;
const LABEL_WIDTH = 150;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.35, 0.35, 0.35);

/** Standard PDF fonts only encode WinAnsi; anything else (e.g. a Hindi title) becomes "?". */
function encodable(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  // A single word wider than the line (a URL) is split by characters.
  return lines.flatMap((l) => {
    if (font.widthOfTextAtSize(l, size) <= maxWidth) return [l];
    const parts: string[] = [];
    let part = "";
    for (const ch of l) {
      if (part && font.widthOfTextAtSize(part + ch, size) > maxWidth) {
        parts.push(part);
        part = ch;
      } else {
        part += ch;
      }
    }
    if (part) parts.push(part);
    return parts;
  });
}

class Writer {
  y: number;
  constructor(
    readonly page: PDFPage,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly mono: PDFFont
  ) {
    this.y = page.getHeight() - 56;
  }

  get right(): number {
    return this.page.getWidth() - LEFT;
  }

  text(text: string, opts: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number; gap?: number } = {}): void {
    const font = opts.font ?? this.font;
    const size = opts.size ?? 9.5;
    const x = opts.x ?? LEFT;
    for (const line of wrap(font, encodable(font, text), size, opts.maxWidth ?? this.right - x)) {
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= size + (opts.gap ?? 3.5);
    }
  }

  field(label: string, value: string, { hash = false } = {}): void {
    const top = this.y;
    this.page.drawText(label, { x: LEFT, y: top, size: 9, font: this.bold, color: MUTED });
    this.text(value, { x: LEFT + LABEL_WIDTH, size: hash ? 8.5 : 9.5, font: hash ? this.mono : this.font });
    this.y = Math.min(this.y, top - 15) - 2;
  }

  heading(text: string): void {
    this.y -= 6;
    this.page.drawText(encodable(this.bold, text), { x: LEFT, y: this.y, size: 10.5, font: this.bold, color: INK });
    this.y -= 6;
    this.page.drawLine({ start: { x: LEFT, y: this.y }, end: { x: this.right, y: this.y }, thickness: 0.5, color: MUTED });
    this.y -= 14;
  }
}

/** The pre-filled, unsigned certificate as PDF bytes. */
export async function buildCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`BSA s.63 certificate: ${input.caseNumber} v${input.versionNo}`);
  pdf.setProducer("DigiVault");
  const page = pdf.addPage(A4);
  const w = new Writer(
    page,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    await pdf.embedFont(StandardFonts.Courier)
  );

  w.text("BHARATIYA SAKSHYA ADHINIYAM, 2023: SECTION 63 CERTIFICATE", { size: 14, font: w.bold });
  w.text("Pre-filled by DigiVault. Not valid until signed in Part A and Part B below.", { size: 9.5, color: MUTED });

  w.heading("Electronic record");
  w.field("Case reference", input.caseNumber);
  w.field("Document title", input.documentTitle);
  w.field("Version", `v${input.versionNo} · ${input.gridSize} x ${input.gridSize} tile grid`);
  if (input.proofVersion === 1) {
    w.field("Proof format", "v1 (legacy, unsalted tiles)");
    w.field("Merkle root (SHA-256)", input.anchoredValue, { hash: true });
  } else {
    w.field("Proof format", `v${input.proofVersion} (salted tiles, RFC 6962)`);
    w.field("Commitment (anchored)", input.anchoredValue, { hash: true });
    w.field("Document root", input.documentRoot, { hash: true });
  }
  w.field("File hash (SHA-256)", input.fileHash, { hash: true });
  w.field("Chain hash", input.chainHash, { hash: true });
  w.field("Previous version hash", input.previousHash ?? "(first version)", { hash: Boolean(input.previousHash) });

  w.heading("Anchor");
  const a = input.anchor;
  if (a) {
    w.field("Polygon Amoy tx", a.txHash, { hash: true });
    w.field("Block", a.block ? `${a.block.number}, ${a.block.time.toISOString()}` : `(not read from the chain; recorded ${a.recordedAt.toISOString()})`);
    w.field("Anchor contract", a.contractAddress, { hash: true });
    w.field("MinIO Object Lock", a.objectLockUri, { hash: true });
  } else {
    w.text("This version is not anchored yet. Generate the certificate again once it is anchored to get the verification QR code.", { color: MUTED });
  }
  w.field("Generated", `${input.generatedAt.toISOString()} for ${input.generatedForRole}`);

  if (a && input.verifyUrl) {
    w.heading("Check on the public blockchain");
    const size = 118;
    const top = w.y + 8;
    const png = await QRCode.toBuffer(input.verifyUrl, { type: "png", errorCorrectionLevel: "M", margin: 1, width: 360 });
    page.drawImage(await pdf.embedPng(png), { x: LEFT, y: top - size, width: size, height: size });
    const x = LEFT + size + 16;
    w.y = top - 10;
    w.text(CERTIFICATE_QR_STATEMENT, { x, size: 9.5 });
    w.y -= 4;
    w.text(input.verifyUrl, { x, size: 7.5, font: w.mono, color: MUTED });
    w.y = Math.min(w.y, top - size) - 10;
  }

  w.heading("Declaration");
  w.text(
    "Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 requires a certificate for electronic evidence signed by the person in charge " +
      "of the computer or communication device (Part A) and by an expert (Part B). Software cannot self-certify evidence: this " +
      "document has no legal effect until both have reviewed the record above and signed.",
    { size: 9 }
  );

  w.y -= 26;
  const colWidth = (w.right - LEFT - 30) / 2;
  const top = w.y;
  for (const [i, title] of ["Part A: officer in charge of the record", "Part B: expert"].entries()) {
    const x = LEFT + i * (colWidth + 30);
    w.y = top;
    page.drawText(title, { x, y: w.y, size: 9.5, font: w.bold, color: INK });
    w.y -= 34;
    page.drawLine({ start: { x, y: w.y }, end: { x: x + colWidth, y: w.y }, thickness: 0.8, color: MUTED });
    w.y -= 11;
    page.drawText("Signature", { x, y: w.y, size: 8, font: w.font, color: MUTED });
    for (const label of ["Name", "Designation", "Date and place"]) {
      w.y -= 22;
      page.drawText(label, { x, y: w.y, size: 8.5, font: w.font, color: MUTED });
      page.drawLine({ start: { x: x + 70, y: w.y - 2 }, end: { x: x + colWidth, y: w.y - 2 }, thickness: 0.5, color: MUTED });
    }
  }

  return pdf.save();
}
