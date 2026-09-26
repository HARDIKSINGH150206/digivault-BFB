// Demo seed for DigiVault: five named accounts, four NCRB Women Safety
// Division cases and nine case documents.
//
// Documents go through the real pipeline, not straight into the database:
// each page is rendered as a lossless PNG, hashed exactly like the server
// (20x20 tiles, raw RGBA pixels, SHA-256 Merkle tree) and uploaded to
// POST /api/v1/evidence/upload. So every document has real page images in
// MinIO, real tile hashes, a real hash chain, AI redaction suggestions (if
// apps/ai-service is running) and a real Polygon Amoy anchor (if the
// deployer wallet has funds; otherwise the anchor shows FAILED and can be
// retried from the UI). Nothing on screen is fabricated.
//
// All people, addresses, phone numbers and events in the documents are
// fictional; every page carries a "synthetic demonstration record" footer.
//
// Safe to re-run: users are upserted by service number, cases by case
// number, and documents already present in a case (by title) are skipped.
//
// Prereqs: DB migrated, web app running (DEMO_BASE_URL, default
// http://localhost:3000). Schema lives in the repo-root prisma/ directory.
// Run from apps/web:
//   node --experimental-strip-types prisma/seed-demo.ts

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const GRID_SIZE = 20;
const PAGE_W = 1240; // A4 at 150 dpi (height rounded to a multiple of 20)
const PAGE_H = 1760;
const BCRYPT_ROUNDS = 10;
const DEPARTMENT = "Women Safety Division";

// --- Accounts ----------------------------------------------------------------

interface DemoUser {
  key: string;
  name: string;
  serviceNumber: string;
  role: Role;
  pin: string;
  authIdentity: string;
}

const USERS: DemoUser[] = [
  { key: "meera", name: "SP Meera Iyer", serviceNumber: "KA/2018/1042", role: "ADMIN", pin: "112233", authIdentity: "meera.iyer@demo.digivault" },
  { key: "rajiv", name: "IO Rajiv Sharma", serviceNumber: "UP/2021/4821", role: "INVESTIGATING_OFFICER", pin: "224466", authIdentity: "rajiv.sharma@demo.digivault" },
  { key: "priya", name: "IO Priya Nair", serviceNumber: "MH/2019/3307", role: "INVESTIGATING_OFFICER", pin: "335577", authIdentity: "priya.nair@demo.digivault" },
  { key: "anand", name: "Court Official Anand", serviceNumber: "DL/2020/7755", role: "COURT_OFFICIAL", pin: "446688", authIdentity: "anand.court@demo.digivault" },
  { key: "kapoor", name: "Forensic Dr. Kapoor", serviceNumber: "RJ/2022/9901", role: "FORENSIC_LAB", pin: "557799", authIdentity: "dr.kapoor@demo.digivault" },
];

// --- Cases and documents ----------------------------------------------------------

interface DemoDocument {
  title: string;
  docType: string;
  pages: string[][]; // lines per page; "# " = heading, "## " = subheading, "---" = rule
}

interface DemoCase {
  caseNumber: string;
  caseType: string;
  // The UI treats "OPEN" as the active state (dashboard counts and badges).
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  department: string;
  owner: "rajiv" | "priya";
  documents: DemoDocument[];
}

const CASES: DemoCase[] = [
  {
    caseNumber: "KA/2024/CR/00147",
    caseType: "SEXUAL_ASSAULT",
    status: "OPEN",
    department: `${DEPARTMENT}, Karnataka State Police`,
    owner: "rajiv",
    documents: [
      {
        title: "First Information Report - KA-2024-147.pdf",
        docType: "FIR",
        pages: [
          [
            "# FIRST INFORMATION REPORT",
            "## (Under Section 173 BNSS)",
            "---",
            "1. District: Bengaluru Urban          P.S.: Jayanagar          Year: 2024",
            "   FIR No.: KA/2024/CR/00147          Date and time of FIR: 14/03/2024 21:40",
            "2. Act and Sections: Bharatiya Nyaya Sanhita, 2023 - Sections 64, 74",
            "3. Occurrence of offence: 13/03/2024, approx. 22:15 hrs",
            "   Place: Service road behind 4th Block bus stop, Jayanagar, Bengaluru 560011",
            "4. Type of information: Written",
            "5. Complainant / Informant:",
            "   Name: Kavya Raghunath          Father's name: R. Raghunath",
            "   Age: 24 years          Occupation: Software test engineer",
            "   Address: No. 18, 2nd Cross, Tilak Nagar, Bengaluru 560041",
            "   Mobile: 98450 31276",
            "6. Details of known / suspected accused:",
            "   Suresh Gowda, aged about 31, resident of Byrasandra, Bengaluru",
            "---",
            "## Contents of the complaint",
            "The complainant states that on 13/03/2024 at about 22:15 hrs, while walking",
            "home from the bus stop, the accused, who is known to her as a former colleague,",
            "stopped his two-wheeler (KA-05-HX-4417) beside her, forcibly held her by the",
            "arm and dragged her towards the unlit service road. She raised an alarm and a",
            "passer-by intervened, after which the accused fled on the same vehicle.",
            "The complainant sustained abrasions on her left forearm and has requested",
            "medical examination and action against the accused.",
            "---",
            "7. Action taken: Case registered and investigation taken up.",
            "   Investigating Officer: IO Rajiv Sharma",
            "8. Signature of officer in charge: ____________________",
          ],
        ],
      },
      {
        title: "Victim Statement (Recorded).pdf",
        docType: "STATEMENT",
        pages: [
          [
            "# STATEMENT OF VICTIM",
            "## Recorded under Section 180 BNSS",
            "---",
            "Case No.: KA/2024/CR/00147          P.S.: Jayanagar, Bengaluru",
            "Date of recording: 16/03/2024          Place: One Stop Centre, Jayanagar",
            "Recorded by: IO Rajiv Sharma, in the presence of a woman counsellor",
            "---",
            "Name of witness: Kavya Raghunath, aged 24",
            "Residing at: No. 18, 2nd Cross, Tilak Nagar, Bengaluru 560041",
            "Contact: 98450 31276",
            "---",
            "I have known Suresh Gowda since 2022, when we worked in the same office in",
            "Koramangala. After I changed jobs in 2023 he continued to message me although",
            "I asked him to stop. On 13 March 2024 I got down at the Jayanagar 4th Block",
            "bus stop at about 10 pm. He was waiting on his scooter near the stop.",
            "He held my arm and pulled me towards the service road behind the stop.",
            "I shouted for help. A delivery rider stopped, and Suresh let go and drove",
            "away. The delivery rider waited with me until my brother arrived.",
            "I went to Jayanagar police station the next evening and gave a written",
            "complaint. I have given my phone to the police so they can see his messages.",
            "---",
            "Statement read over and explained in Kannada; admitted to be correct.",
            "Signature of witness: ____________________",
            "Signature of recording officer: ____________________",
          ],
        ],
      },
      {
        title: "Medical Examination Report - NIMHANS.pdf",
        docType: "MEDICAL_REPORT",
        pages: [
          [
            "# MEDICO-LEGAL EXAMINATION REPORT",
            "## National Institute of Mental Health and Neuro Sciences, Bengaluru",
            "---",
            "MLC No.: NIM/MLC/2024/0388          Police requisition: KA/2024/CR/00147",
            "Date and time of examination: 15/03/2024 11:20",
            "Brought by: WPC 2231, Jayanagar P.S.          Consent obtained: Yes (written)",
            "---",
            "Name: Kavya Raghunath          Age / Sex: 24 / F",
            "Address: No. 18, 2nd Cross, Tilak Nagar, Bengaluru 560041",
            "Identification marks: Mole on right cheek; scar on left knee",
            "---",
            "## Findings",
            "1. Linear abrasion 4 cm x 0.5 cm on the dorsal aspect of left forearm,",
            "   reddish, with scab formation beginning. Age: 24 to 48 hours.",
            "2. Contusion 3 cm x 2 cm on the left upper arm, bluish red.",
            "3. No other injuries detected on general physical examination.",
            "## Opinion",
            "Injuries are simple in nature and consistent with forcible gripping and",
            "dragging as described in the history. Psychological first aid provided;",
            "referred for follow-up counselling.",
            "---",
            "Examining medical officer: Dr. S. Venkatesh, MD (Forensic Medicine)",
            "Signature and seal: ____________________",
          ],
        ],
      },
    ],
  },
  {
    caseNumber: "UP/2024/CR/00892",
    caseType: "DOMESTIC_VIOLENCE",
    status: "OPEN",
    department: `${DEPARTMENT}, Uttar Pradesh Police`,
    owner: "priya",
    documents: [
      {
        title: "FIR Copy - UP-2024-892.pdf",
        docType: "FIR",
        pages: [
          [
            "# FIRST INFORMATION REPORT",
            "## (Under Section 173 BNSS)",
            "---",
            "1. District: Lucknow          P.S.: Gomti Nagar          Year: 2024",
            "   FIR No.: UP/2024/CR/00892          Date and time of FIR: 02/06/2024 10:05",
            "2. Act and Sections: Bharatiya Nyaya Sanhita, 2023 - Sections 85, 115(2), 351(2)",
            "   Dowry Prohibition Act, 1961 - Section 4",
            "3. Occurrence of offence: Continuing, last incident 01/06/2024 approx. 23:00",
            "   Place: House No. B-212, Vijay Khand, Gomti Nagar, Lucknow 226010",
            "4. Complainant: Neha Verma, W/o Amit Verma, aged 29",
            "   Address: House No. B-212, Vijay Khand, Gomti Nagar, Lucknow 226010",
            "   Mobile: 94150 62811",
            "5. Accused: (1) Amit Verma, husband, aged 33  (2) Sushila Verma, mother-in-law",
            "---",
            "## Contents of the complaint",
            "The complainant states that since her marriage in November 2021 her husband",
            "and mother-in-law have demanded Rs. 5,00,000 and a car from her parents.",
            "On refusal she has been repeatedly beaten and threatened. On the night of",
            "01/06/2024 her husband struck her with a belt and threatened to throw her",
            "out of the house. Neighbours called the 112 helpline.",
            "---",
            "6. Action taken: Case registered; complainant sent for medical examination;",
            "   Protection Officer informed under the PWDV Act, 2005.",
            "   Investigating Officer: IO Priya Nair",
          ],
        ],
      },
      {
        title: "Witness Statement - Neighbour Account.pdf",
        docType: "STATEMENT",
        pages: [
          [
            "# STATEMENT OF WITNESS",
            "## Recorded under Section 180 BNSS",
            "---",
            "Case No.: UP/2024/CR/00892          P.S.: Gomti Nagar, Lucknow",
            "Date of recording: 04/06/2024",
            "Witness: Ramesh Chandra Tiwari, aged 58, retired bank officer",
            "Address: House No. B-214, Vijay Khand, Gomti Nagar, Lucknow 226010",
            "Mobile: 99355 20476",
            "---",
            "I live next door to the Verma family. Over the last two years I have often",
            "heard shouting from their house late at night, and on several occasions",
            "I heard Neha crying for help. On 1 June 2024 at about 11 pm I heard loud",
            "shouting and the sound of beating. I went to their gate and saw Neha on the",
            "verandah with a bleeding lip. Her husband Amit was shouting that she should",
            "go back to her father's house and bring the money. I called 112 from my",
            "phone. The PRV vehicle reached in about fifteen minutes.",
            "---",
            "Statement read over and admitted to be correct.",
            "Signature of witness: ____________________",
            "Recorded by: IO Priya Nair          Signature: ____________________",
          ],
        ],
      },
    ],
  },
  {
    caseNumber: "MH/2024/CR/01203",
    caseType: "SEXUAL_ASSAULT",
    status: "UNDER_REVIEW",
    department: `${DEPARTMENT}, Maharashtra Police`,
    owner: "priya",
    documents: [
      {
        title: "Charge Sheet Draft v2.pdf",
        docType: "CHARGE_SHEET",
        pages: [
          [
            "# FINAL REPORT (CHARGE SHEET) - DRAFT",
            "## Under Section 193 BNSS",
            "---",
            "Court: Additional Sessions Judge, Pune          Case No.: MH/2024/CR/01203",
            "Police Station: Shivajinagar, Pune          FIR date: 08/05/2024",
            "Sections: Bharatiya Nyaya Sanhita, 2023 - Sections 64(1), 351(3)",
            "---",
            "Accused: Nikhil Deshmukh, aged 27, S/o Prakash Deshmukh",
            "Address: Flat 5, Sai Residency, Aundh, Pune 411007          Status: In custody",
            "Victim: Identity withheld under Section 72 BNS (referred to as 'X')",
            "---",
            "## Brief facts",
            "The victim, aged 22, a student, was sexually assaulted by the accused on",
            "06/05/2024 at his flat in Aundh after he offered her a lift from college.",
            "The victim disclosed the incident to her mother on 07/05/2024 and the FIR",
            "was registered the next day. The accused was arrested on 09/05/2024.",
            "## Evidence relied upon",
            "1. Statement of victim under Section 183 BNSS before the Magistrate",
            "2. Medico-legal report, Sassoon General Hospital",
            "3. DNA profiling report, FSL Mumbai (see enclosed)",
            "4. CCTV footage, Sai Residency entrance, 06/05/2024 18:40 to 21:15",
            "5. Call detail records of the accused's mobile number",
            "---",
            "Prepared by: IO Priya Nair          Reviewed by: ____________________",
          ],
        ],
      },
      {
        title: "Forensic DNA Report - FSL Mumbai.pdf",
        docType: "FORENSIC_REPORT",
        pages: [
          [
            "# DNA PROFILING REPORT",
            "## Forensic Science Laboratory, Mumbai - DNA Division",
            "---",
            "Lab ref.: FSL/MUM/DNA/2024/2211          Case No.: MH/2024/CR/01203",
            "Forwarded by: P.I., Shivajinagar P.S., Pune, letter dated 10/05/2024",
            "Exhibits received sealed on 11/05/2024; seals intact and tallied",
            "---",
            "## Exhibits",
            "Ex. 1  Vaginal swab of victim 'X' (sealed envelope, SGH/MLC/1142)",
            "Ex. 2  Undergarment of victim 'X'",
            "Ex. 3  Blood sample of accused Nikhil Deshmukh on FTA card",
            "Ex. 4  Bedsheet seized from Flat 5, Sai Residency, Aundh, Pune",
            "## Method",
            "DNA extracted by organic method; quantified by real-time PCR; amplified",
            "using a 23-locus autosomal STR kit and Y-STR kit; analysed on a genetic",
            "analyser. Positive and negative controls gave expected results.",
            "## Result",
            "The male DNA profile from Ex. 1, Ex. 2 and Ex. 4 matches the DNA profile",
            "of the accused (Ex. 3) at all loci tested. Random match probability for the",
            "autosomal profile: less than 1 in 10^18 in the Indian population database.",
            "---",
            "Assistant Director (DNA): Dr. M. Kulkarni          Signature: ____________________",
          ],
        ],
      },
    ],
  },
  {
    caseNumber: "KA/2023/CR/00521",
    caseType: "DOMESTIC_VIOLENCE",
    status: "CLOSED",
    department: `${DEPARTMENT}, Karnataka State Police`,
    owner: "rajiv",
    documents: [
      {
        title: "Final Charge Sheet - Signed.pdf",
        docType: "CHARGE_SHEET",
        pages: [
          [
            "# FINAL REPORT (CHARGE SHEET)",
            "## Under Section 193 BNSS",
            "---",
            "Court: Chief Judicial Magistrate, Bengaluru          Case No.: KA/2023/CR/00521",
            "Police Station: Rajajinagar, Bengaluru          FIR date: 19/09/2023",
            "Sections: Bharatiya Nyaya Sanhita, 2023 - Sections 85, 115(2)",
            "---",
            "Complainant: Lakshmi Prasad, aged 34",
            "Address: No. 42, 6th Main, Rajajinagar 2nd Block, Bengaluru 560010",
            "Mobile: 97411 58320",
            "Accused: Prasad Kumar, husband, aged 38, same address. Status: On bail",
            "---",
            "## Brief facts",
            "The accused subjected the complainant to cruelty over a period of three",
            "years, including assault on 17/09/2023 causing a fracture of the left",
            "wrist. Medical records, the statements of two neighbours and the",
            "complainant's sister, and photographs of the injuries establish the offence.",
            "## Witnesses",
            "LW1 Complainant; LW2 Geetha S. (sister); LW3 and LW4 neighbours;",
            "LW5 Dr. A. Rao, Victoria Hospital; LW6 IO Rajiv Sharma",
            "---",
            "Charge sheet filed on 12/12/2023.",
            "Signed: IO Rajiv Sharma          Forwarded by: SHO, Rajajinagar P.S.",
          ],
        ],
      },
      {
        title: "Court Order - Sessions Court Bengaluru.pdf",
        docType: "COURT_ORDER",
        pages: [
          [
            "# IN THE COURT OF THE LXVI ADDITIONAL CITY CIVIL AND SESSIONS JUDGE",
            "## Bengaluru City",
            "---",
            "Criminal Appeal arising from Case No. KA/2023/CR/00521",
            "State of Karnataka, by Rajajinagar Police          ... Complainant",
            "versus",
            "Prasad Kumar, S/o Krishnappa, aged 38          ... Accused",
            "---",
            "## Order",
            "Heard the learned Public Prosecutor and the learned counsel for the",
            "accused. Perused the charge sheet, the medical evidence and the depositions",
            "of LW1 to LW6.",
            "The prosecution has proved beyond reasonable doubt that the accused",
            "subjected the complainant to cruelty and voluntarily caused her hurt.",
            "The accused is convicted under Sections 85 and 115(2) of the Bharatiya",
            "Nyaya Sanhita, 2023, and sentenced to rigorous imprisonment for two years",
            "and a fine of Rs. 25,000, of which Rs. 20,000 shall be paid to the",
            "complainant as compensation under Section 395 BNSS.",
            "The identity and address of the complainant shall not be published.",
            "---",
            "Pronounced in open court on 22/07/2024.",
            "Sessions Judge: ____________________          Seal of the Court",
          ],
        ],
      },
    ],
  },
];

// --- Page rendering and hashing (mirrors apps/web/src/lib/server-hash.ts) ----------

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderPage(lines: string[], caseNumber: string, pageNo: number, pageCount: number): Promise<Buffer> {
  const parts: string[] = [];
  let y = 120;
  for (const line of lines) {
    if (line === "---") {
      parts.push(`<line x1="90" y1="${y - 14}" x2="${PAGE_W - 90}" y2="${y - 14}" stroke="#555" stroke-width="1"/>`);
      y += 14;
    } else if (line.startsWith("# ")) {
      parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="DejaVu Serif" font-size="30" font-weight="bold">${escapeXml(line.slice(2))}</text>`);
      y += 44;
    } else if (line.startsWith("## ")) {
      parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="DejaVu Serif" font-size="21" font-style="italic">${escapeXml(line.slice(3))}</text>`);
      y += 40;
    } else {
      parts.push(`<text x="90" y="${y}" font-family="DejaVu Sans" font-size="20" xml:space="preserve">${escapeXml(line)}</text>`);
      y += 34;
    }
  }
  const footer =
    `Page ${pageNo} of ${pageCount}  |  ${caseNumber}  |  ` +
    "SYNTHETIC DEMONSTRATION RECORD - all persons and events are fictional";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">` +
    `<rect width="100%" height="100%" fill="#fdfdfb"/>` +
    `<g fill="#111">${parts.join("")}</g>` +
    `<text x="${PAGE_W / 2}" y="${PAGE_H - 50}" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="#777">${escapeXml(footer)}</text>` +
    `</svg>`;
  // Lossless PNG only (CLAUDE.md rule 1).
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function sha256(buf: Uint8Array): Buffer {
  return createHash("sha256").update(buf).digest();
}

interface TileMeta {
  tile_index: number;
  page_index: number;
  row: number;
  col: number;
  hash: string;
}

async function hashPageTiles(png: Buffer, pageIndex: number): Promise<TileMeta[]> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tileW = Math.ceil(info.width / GRID_SIZE);
  const tileH = Math.ceil(info.height / GRID_SIZE);
  const tiles: TileMeta[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = col * tileW;
      const y = row * tileH;
      const w = Math.min(tileW, info.width - x);
      const h = Math.min(tileH, info.height - y);
      const out = Buffer.alloc(Math.max(w, 0) * Math.max(h, 0) * 4);
      for (let r = 0; r < h; r++) {
        const src = ((y + r) * info.width + x) * 4;
        data.copy(out, r * w * 4, src, src + w * 4);
      }
      tiles.push({
        tile_index: pageIndex * GRID_SIZE ** 2 + row * GRID_SIZE + col,
        page_index: pageIndex,
        row,
        col,
        hash: sha256(out).toString("hex"),
      });
    }
  }
  return tiles;
}

// merkletreejs with sortPairs:false: an odd node at the end of a level is
// carried up unchanged, not duplicated.
function merkleRoot(leafHexes: string[]): string {
  let level: Buffer[] = leafHexes.map((h) => Buffer.from(h, "hex"));
  while (level.length > 1) {
    const next: Buffer[] = [];
    let i = 0;
    for (; i + 1 < level.length; i += 2) next.push(sha256(Buffer.concat([level[i], level[i + 1]])));
    if (i < level.length) next.push(level[i]);
    level = next;
  }
  return level[0].toString("hex");
}

function clientHash(pngs: Buffer[]): string {
  const parts: Buffer[] = [];
  for (const png of pngs) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(png.byteLength, 0);
    parts.push(len, png);
  }
  return sha256(Buffer.concat(parts)).toString("hex");
}

// --- API helpers ----------------------------------------------------------------------

async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

async function login(user: DemoUser): Promise<string> {
  const body = await api<{ token: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ serviceNumber: user.serviceNumber, pin: user.pin }),
  });
  return body.token;
}

async function uploadDocument(token: string, caseId: string, caseNumber: string, doc: DemoDocument) {
  const pngs: Buffer[] = [];
  for (let i = 0; i < doc.pages.length; i++) pngs.push(await renderPage(doc.pages[i], caseNumber, i + 1, doc.pages.length));
  const tiles: TileMeta[] = [];
  for (let i = 0; i < pngs.length; i++) tiles.push(...(await hashPageTiles(pngs[i], i)));

  const metadata = {
    case_id: caseId,
    document_id: null,
    title: doc.title,
    doc_type: doc.docType,
    source_type: "NATIVE_PDF",
    grid_size: GRID_SIZE,
    page_count: pngs.length,
    client_hash: clientHash(pngs),
    merkle_root: merkleRoot(tiles.map((t) => t.hash)),
    tiles,
    pages: pngs.map((_, i) => ({ page_index: i, width_px: PAGE_W, height_px: PAGE_H })),
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  pngs.forEach((png, i) => form.set(`page_${i}`, new Blob([new Uint8Array(png)], { type: "image/png" }), `page-${i}.png`));
  return api<{ document_id: string; document_version_id: string }>("/api/v1/evidence/upload", token, {
    method: "POST",
    body: form,
  });
}

// --- Seed -----------------------------------------------------------------------------

async function seedUsers(): Promise<Record<string, { id: string; user: DemoUser }>> {
  const out: Record<string, { id: string; user: DemoUser }> = {};
  for (const u of USERS) {
    const pinHash = await bcrypt.hash(u.pin, BCRYPT_ROUNDS);
    const row = await prisma.user.upsert({
      where: { serviceNumber: u.serviceNumber },
      update: { role: u.role, pinHash, authIdentity: u.authIdentity, department: DEPARTMENT },
      create: { role: u.role, pinHash, authIdentity: u.authIdentity, department: DEPARTMENT, serviceNumber: u.serviceNumber },
    });
    out[u.key] = { id: row.id, user: u };
    console.log(`user  ${u.serviceNumber.padEnd(14)} ${u.role.padEnd(22)} ${u.name}`);
  }
  return out;
}

async function waitForAnchors(token: string, versions: { documentId: string; versionId: string }[], timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  const settled = new Map<string, string>();
  while (settled.size < versions.length && Date.now() < deadline) {
    for (const v of versions) {
      if (settled.has(v.versionId)) continue;
      const info = await api<{ anchor: { status: string } | null }>(
        `/api/v1/documents/${v.documentId}/versions/${v.versionId}`,
        token
      );
      if (info.anchor && info.anchor.status !== "PENDING") settled.set(v.versionId, info.anchor.status);
    }
    if (settled.size < versions.length) await new Promise((r) => setTimeout(r, 3000));
  }
  return settled;
}

async function main() {
  try {
    await fetch(`${BASE}/login`);
  } catch {
    throw new Error(`Web app not reachable at ${BASE}. Start it first (pnpm --filter @digivault/web dev).`);
  }

  const users = await seedUsers();
  const tokens: Record<string, string> = {};
  for (const key of ["rajiv", "priya", "anand"]) tokens[key] = await login(users[key].user);

  const reviewedVersions: { documentId: string; versionId: string }[] = [];
  const newVersions: { documentId: string; versionId: string }[] = [];

  for (const c of CASES) {
    const ownerId = users[c.owner].id;
    let kase = await prisma.case.findUnique({ where: { caseNumber: c.caseNumber } });
    if (!kase) {
      // Through the API so the case gets its CREATE_CASE audit entry.
      await api("/api/v1/cases", tokens[c.owner], {
        method: "POST",
        body: JSON.stringify({ case_number: c.caseNumber, case_type: c.caseType, department: c.department, status: c.status }),
      });
      kase = await prisma.case.findUniqueOrThrow({ where: { caseNumber: c.caseNumber } });
    }
    kase = await prisma.case.update({
      where: { id: kase.id },
      data: { caseType: c.caseType, status: c.status, department: c.department, createdById: ownerId },
    });
    console.log(`case  ${c.caseNumber} ${c.caseType} ${c.status}`);

    for (const doc of c.documents) {
      const existing = await prisma.document.findFirst({
        where: { caseId: kase.id, title: doc.title, currentVersionId: { not: null } },
      });
      let ref: { documentId: string; versionId: string };
      if (existing) {
        ref = { documentId: existing.id, versionId: existing.currentVersionId! };
        console.log(`  doc exists   ${doc.title}`);
      } else {
        const res = await uploadDocument(tokens[c.owner], kase.id, c.caseNumber, doc);
        ref = { documentId: res.document_id, versionId: res.document_version_id };
        newVersions.push(ref);
        console.log(`  doc uploaded ${doc.title}`);
      }
      if (c.status !== "OPEN") reviewedVersions.push(ref);
    }
  }

  // The court official opens the closed and under-review documents, through
  // the real page route so the views are audited as VIEW_DOCUMENT_VERSION.
  const anand = users.anand.id;
  for (const v of reviewedVersions) {
    const viewed = await prisma.auditLog.findFirst({
      where: { actorId: anand, action: "VIEW_DOCUMENT_VERSION", targetId: v.versionId },
    });
    if (viewed) continue;
    const res = await fetch(`${BASE}/api/v1/documents/${v.documentId}/versions/${v.versionId}/pages/0`, {
      headers: { Authorization: `Bearer ${tokens.anand}` },
    });
    if (!res.ok) throw new Error(`Court official page view failed: ${res.status}`);
    await res.arrayBuffer();
  }

  if (newVersions.length > 0) {
    console.log(`waiting for ${newVersions.length} background anchor(s)...`);
    const settled = await waitForAnchors(tokens.rajiv, newVersions);
    const counts: Record<string, number> = {};
    for (const v of newVersions) {
      const s = settled.get(v.versionId) ?? "PENDING";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    console.log("anchors:", counts);
    if (counts.FAILED) {
      console.log("Some anchors failed (e.g. deployer wallet out of gas or RPC unreachable).");
      console.log("Fix the cause, then use 'Retry anchoring' on each version page.");
    }
  }
  console.log("demo seed complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
