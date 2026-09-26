// One-off manual integration smoke test for the step-4 API routes,
// deliberately reimplementing the tile-hash/Merkle algorithm independently
// (plain Node crypto, not importing @digivault/crypto-core) so this is a
// real cross-check against docs/03-crypto-and-merkle-spec.md rather than a
// tautological "same code testing itself" comparison. Not a deliverable,
// not wired into any test runner — thrown away after this session.
import sharp from "sharp";
import { createHash } from "node:crypto";

const BASE = "http://localhost:3100";
const GRID_SIZE = 20;
const SIZE = 400; // -> exactly 20x20 px tiles, no edge clamping

function sha256hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Matches merkletreejs's actual odd-node behavior (verified directly
// against the library, not assumed): a leftover node at an odd-length
// level carries up UNCHANGED to the next level instead of being duplicated
// and re-hashed with itself.
function buildMerkleRoot(leafHexes) {
  let level = leafHexes.map((h) => Buffer.from(h, "hex"));
  while (level.length > 1) {
    const next = [];
    let i = 0;
    for (; i + 1 < level.length; i += 2) {
      next.push(createHash("sha256").update(Buffer.concat([level[i], level[i + 1]])).digest());
    }
    if (i < level.length) next.push(level[i]);
    level = next;
  }
  return level[0].toString("hex");
}

async function buildTestPage() {
  const svgStripes = Array.from({ length: 8 }, (_, i) =>
    `<rect x="${i * 50}" y="0" width="50" height="${SIZE}" fill="rgb(${i * 30},${255 - i * 20},${i * 10})"/>`
  ).join("");
  const png = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 250, g: 248, b: 240, alpha: 1 } },
  })
    .composite([{ input: Buffer.from(`<svg width="${SIZE}" height="${SIZE}">${svgStripes}</svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const tileSize = SIZE / GRID_SIZE;
  const tiles = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const out = Buffer.alloc(tileSize * tileSize * 4);
      for (let r = 0; r < tileSize; r++) {
        const srcOffset = ((row * tileSize + r) * info.width + col * tileSize) * 4;
        data.copy(out, r * tileSize * 4, srcOffset, srcOffset + tileSize * 4);
      }
      tiles.push({ tile_index: row * GRID_SIZE + col, page_index: 0, row, col, hash: sha256hex(out) });
    }
  }
  const clientHashInput = Buffer.concat([Buffer.alloc(4), png]); // length-prefix(0) + only page
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(png.byteLength, 0);
  const clientHash = sha256hex(Buffer.concat([lenBuf, png]));
  const merkleRoot = buildMerkleRoot(tiles.map((t) => t.hash));

  return { png, tiles, clientHash, merkleRoot };
}

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = await res.json();
  return body.token;
}

async function tamperOnePixelTile(png) {
  // Flips real pixel content inside tile (row=3,col=3) — the actual attack
  // rule 4 defends against: client lies about the hash of content it's
  // sending, not just a bogus entry in the diagnostic tiles[] array (which
  // the server never trusts anyway — see docs/04's endpoint-1 rule box).
  const tileSize = SIZE / GRID_SIZE;
  return sharp(png)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${SIZE}" height="${SIZE}"><rect x="${3 * tileSize}" y="${3 * tileSize}" width="${tileSize}" height="${tileSize}" fill="black"/></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

function buildUploadForm({ png, tiles, clientHash, merkleRoot, caseId, tamper }) {
  const metadata = {
    case_id: caseId,
    document_id: null,
    title: "Smoke Test FIR",
    doc_type: "FIR",
    source_type: "NATIVE_PDF",
    grid_size: GRID_SIZE,
    page_count: 1,
    client_hash: tamper === "client_hash" ? "0".repeat(64) : clientHash,
    merkle_root: tamper === "merkle_root" ? "0".repeat(64) : merkleRoot,
    tiles,
    pages: [{ page_index: 0, width_px: SIZE, height_px: SIZE }],
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("page_0", new Blob([png], { type: "image/png" }), "page-0.png");
  return form;
}

async function main() {
  const results = {};

  const investigatorToken = await login(process.argv[2]);
  const courtToken = await login(process.argv[3]);
  const caseId = process.argv[4];

  const testPage = await buildTestPage();

  // 1. RBAC: COURT_OFFICIAL must be rejected on upload.
  {
    const res = await fetch(`${BASE}/api/v1/evidence/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${courtToken}` },
      body: buildUploadForm({ ...testPage, caseId }),
    });
    results.rbac_court_official_rejected = res.status === 403;
  }

  // 2. Tampered merkle_root -> 409.
  {
    const res = await fetch(`${BASE}/api/v1/evidence/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investigatorToken}` },
      body: buildUploadForm({ ...testPage, caseId, tamper: "merkle_root" }),
    });
    const body = await res.json();
    results.tampered_merkle_root_rejected = res.status === 409 && body.error === "HASH_MISMATCH";
  }

  // 3. Real pixel tamper in one tile, submitted with the PRE-tamper hashes
  // (the actual attack rule 4 defends against) -> 409, and that specific
  // tile_index (row=3,col=3 -> index 63) is named in the mismatch list.
  {
    const tamperedPng = await tamperOnePixelTile(testPage.png);
    const form = buildUploadForm({ ...testPage, png: tamperedPng, caseId });
    const res = await fetch(`${BASE}/api/v1/evidence/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investigatorToken}` },
      body: form,
    });
    const body = await res.json();
    results.tampered_tile_detected =
      res.status === 409 && body.error === "HASH_MISMATCH" && body.mismatched_tile_indices.includes(63);
  }

  // 4. Legitimate upload -> 201.
  let versionId, documentId;
  {
    const res = await fetch(`${BASE}/api/v1/evidence/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investigatorToken}` },
      body: buildUploadForm({ ...testPage, caseId }),
    });
    const body = await res.json();
    results.legit_upload_201 = res.status === 201;
    results.legit_upload_merkle_root_matches = body.merkle_root === testPage.merkleRoot;
    versionId = body.document_version_id;
    documentId = body.document_id;
  }

  // 5. Confirm redaction on tile 0.
  {
    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${versionId}/redactions/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${investigatorToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed_tile_indices: [0] }),
    });
    const body = await res.json();
    results.confirm_redaction_201 = res.status === 201;
    results.confirm_redaction_new_root_differs = body.merkle_root !== testPage.merkleRoot;
  }

  // 6. Proof before anchoring -> 409 NOT_ANCHORED (expected — no live RPC in this sandbox).
  {
    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${versionId}/proof`, {
      headers: { Authorization: `Bearer ${investigatorToken}` },
    });
    const body = await res.json();
    results.proof_not_anchored_409 = res.status === 409 && body.error === "NOT_ANCHORED";
  }

  console.log(JSON.stringify(results, null, 2));
  const allPassed = Object.values(results).every(Boolean);
  console.log(allPassed ? "\nSMOKE TEST PASSED" : "\nSMOKE TEST FAILED");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
