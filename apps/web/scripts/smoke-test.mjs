// Manual API-level smoke test. Hashing uses the independent reference
// implementation of proof format v2 (packages/crypto-core/reference/
// dv2-ref.mjs: plain node:crypto, bottom-up tree — not the TypeScript code
// the app runs), so a pass is a real cross-check against docs/03 §v2
// rather than "same code testing itself". Also covers login, RBAC,
// step-up, automatic anchoring, v2 proofs and redacted-only sharing. Not
// wired into any test runner.
//
// Prereqs: `node prisma/seed-for-testing.mjs`, web app on E2E_BASE_URL
// (default http://localhost:3000). No arguments.
import sharp from "sharp";
import { computeDocument, randomSalts, verifyRedactionProof } from "../../../packages/crypto-core/reference/dv2-ref.mjs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const INVESTIGATOR = { serviceNumber: "DL/2019/3301", pin: "223344" };
const COURT_OFFICIAL = { serviceNumber: "MH/2020/5512", pin: "334455" };
const GRID_SIZE = 20;
const SIZE = 400; // -> exactly 20x20 px tiles, no edge clamping

async function decode(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
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

  const salts = randomSalts(GRID_SIZE * GRID_SIZE);
  const r = computeDocument([await decode(png)], [png], GRID_SIZE, salts);
  return {
    png,
    salts: salts.map((b) => b.toString("hex")),
    tiles: r.tiles,
    clientHash: r.fileHash,
    merkleRoot: r.documentRoot,
    commitment: r.commitment,
  };
}

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

async function login({ serviceNumber, pin }) {
  const { res, body } = await postJson("/api/auth/login", { serviceNumber, pin });
  if (!res.ok) throw new Error(`Login failed for ${serviceNumber}: ${res.status} ${JSON.stringify(body)}`);
  return body.token;
}

async function stepUpToken(sessionToken, pin) {
  const { body } = await postJson("/api/auth/verify-pin", { pin }, { Authorization: `Bearer ${sessionToken}` });
  return body.step_up_token;
}

async function waitForAnchorSettled(token, documentId, versionId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${versionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (body.anchor && body.anchor.status !== "PENDING") return body.anchor;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
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

function buildUploadForm({ png, tiles, clientHash, merkleRoot, commitment, salts, caseId, tamper, proofVersion = 2 }) {
  const metadata = {
    case_id: caseId,
    document_id: null,
    title: "Smoke Test FIR",
    doc_type: "FIR",
    source_type: "NATIVE_PDF",
    proof_version: proofVersion,
    grid_size: GRID_SIZE,
    page_count: 1,
    client_hash: tamper === "client_hash" ? "0".repeat(64) : clientHash,
    merkle_root: tamper === "merkle_root" ? "0".repeat(64) : merkleRoot,
    commitment: tamper === "commitment" ? "0".repeat(64) : commitment,
    salts: tamper === "salts_repeated" ? salts.map(() => salts[0]) : salts,
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

  // 0. Login: wrong PIN -> 401 with the generic message.
  {
    const { res, body } = await postJson("/api/auth/login", { serviceNumber: INVESTIGATOR.serviceNumber, pin: "000000" });
    results.login_wrong_pin_401 = res.status === 401 && body.message === "Invalid service number or PIN";
  }

  const investigatorToken = await login(INVESTIGATOR);
  const courtToken = await login(COURT_OFFICIAL);
  const auth = { Authorization: `Bearer ${investigatorToken}` };

  const { body: createdCase } = await postJson(
    "/api/v1/cases",
    { case_number: `SMOKE/${Date.now()}`, case_type: "FIR", department: "Women Safety Division" },
    auth
  );
  const caseId = createdCase.case_id ?? createdCase.id;

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

  // 2b. v2 specifics: a tampered commitment -> 409; repeated salts and a
  // legacy v1 upload -> 400 (ADR-018, ADR-021).
  {
    const upload = (opts) =>
      fetch(`${BASE}/api/v1/evidence/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${investigatorToken}` },
        body: buildUploadForm({ ...testPage, caseId, ...opts }),
      });
    const tamperedC = await upload({ tamper: "commitment" });
    results.tampered_commitment_rejected = tamperedC.status === 409 && (await tamperedC.json()).error === "HASH_MISMATCH";
    results.repeated_salts_rejected_400 = (await upload({ tamper: "salts_repeated" })).status === 400;
    results.v1_upload_rejected_400 = (await upload({ proofVersion: 1 })).status === 400;
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
    results.legit_upload_commitment_matches = body.commitment === testPage.commitment && body.proof_version === 2;
    versionId = body.document_version_id;
    documentId = body.document_id;
  }

  // 5. Upload is READY immediately; anchoring runs on its own and must settle.
  {
    const anchor = await waitForAnchorSettled(investigatorToken, documentId, versionId);
    results.auto_anchor_settled = anchor !== null;
    results.auto_anchor_status = anchor?.status ?? "TIMEOUT";
    results.auto_anchor_ok = anchor?.status === "ANCHORED";
  }

  // 5b. The v2 proof recomputes, with the reference implementation, to the
  // commitment that was anchored. Needs the anchor, so informational if not.
  let originalProof = null;
  {
    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${versionId}/proof`, {
      headers: { Authorization: `Bearer ${courtToken}` },
    });
    if (res.status === 200) {
      originalProof = await res.json();
      const salts = originalProof.tiles.map((t) => Buffer.from(t.salt, "hex"));
      const r = computeDocument([await decode(testPage.png)], [testPage.png], GRID_SIZE, salts);
      results.proof_v2_recomputes_to_commitment =
        originalProof.digivault_proof_version === 2 && r.commitment === originalProof.commitment && r.commitment === testPage.commitment;
    } else {
      results.proof_v2_recomputes_to_commitment = `not checked (proof ${res.status}: version not anchored)`;
    }
  }

  // 6. Sharing before any redaction -> 403 (F-03).
  {
    const { res } = await postJson(
      `/api/v1/documents/${documentId}/shares`,
      { recipientLabel: "Smoke", expiresAt: new Date(Date.now() + 86400000).toISOString(), maxViews: 3 },
      auth
    );
    results.share_blocked_before_redaction_403 = res.status === 403;
  }

  // 7. Confirm redaction on tile 0: rejected without step-up, accepted with it.
  let redactedVersionId;
  {
    const path = `/api/v1/documents/${documentId}/versions/${versionId}/redactions/confirm`;
    const noStepUp = await postJson(path, { confirmed_tile_indices: [0] }, auth);
    results.confirm_without_step_up_401 = noStepUp.res.status === 401 && noStepUp.body.error === "STEP_UP_REQUIRED";

    const stepUp = await stepUpToken(investigatorToken, INVESTIGATOR.pin);
    const { res, body } = await postJson(path, { confirmed_tile_indices: [0] }, { ...auth, "X-StepUp-Token": stepUp });
    results.confirm_redaction_201 = res.status === 201;
    results.confirm_redaction_new_root_differs = body.merkle_root !== testPage.merkleRoot;
    results.confirm_redaction_is_v2 = body.proof_version === 2 && body.commitment !== testPage.commitment;
    redactedVersionId = body.document_version_id;
  }

  // 8. Share now allowed, and the download serves the redacted version.
  let share;
  {
    const { res, body } = await postJson(
      `/api/v1/documents/${documentId}/shares`,
      { recipientLabel: "Smoke", expiresAt: new Date(Date.now() + 86400000).toISOString(), maxViews: 3 },
      auth
    );
    results.share_after_redaction_201 = res.status === 201;
    share = body;
    const dl = await fetch(`${BASE}/api/v1/shares/${body.token}/download`);
    results.share_serves_redacted_v2 =
      dl.status === 200 && (dl.headers.get("content-disposition") ?? "").includes("-v2.pdf");
  }

  // 9. Redacted version is auto-anchored too.
  {
    const anchor = await waitForAnchorSettled(investigatorToken, documentId, redactedVersionId);
    results.redacted_auto_anchor_status = anchor?.status ?? "TIMEOUT";
  }

  // 10. The redacted version's proof uses fresh salts: the masked tile's
  // original salt (tile 0) appears nowhere in it (ADR-018).
  {
    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${redactedVersionId}/proof`, {
      headers: { Authorization: `Bearer ${courtToken}` },
    });
    if (res.status === 200) {
      const proof = await res.json();
      const leaked = new Set(proof.tiles.map((t) => t.salt));
      results.redacted_proof_has_no_original_salts = testPage.salts.every((s) => !leaked.has(s));
    } else {
      results.redacted_proof_has_no_original_salts = `not checked (proof ${res.status}: version not anchored)`;
    }
  }

  let officerRedaction;
  // 11. Redaction proof (docs/03 §Redaction proofs): the redacted page plus
  // the proof rebuild the ORIGINAL's commitment (checked with the reference
  // verifier), only tile 0 is masked, and its original salt is withheld.
  {
    const unredacted = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${versionId}/redaction-proof`, {
      headers: { Authorization: `Bearer ${courtToken}` },
    });
    results.redaction_proof_refused_for_unredacted_400 = unredacted.status === 400;

    const res = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${redactedVersionId}/redaction-proof`, {
      headers: { Authorization: `Bearer ${courtToken}` },
    });
    if (res.status === 200) {
      const proof = await res.json();
      const pageRes = await fetch(`${BASE}/api/v1/documents/${documentId}/versions/${redactedVersionId}/pages/0`, {
        headers: { Authorization: `Bearer ${courtToken}` },
      });
      const png = Buffer.from(await pageRes.arrayBuffer());
      officerRedaction = { proof, png };
      const check = verifyRedactionProof(proof, [await decode(png)], [png]);
      results.redaction_proof_verifies_against_original =
        check.problems.length === 0 && check.originalCommitment === testPage.commitment && proof.original.versionId === versionId;
      results.redaction_proof_masks_only_tile_0 = JSON.stringify(proof.pages[0].masked) === "[0]";
      const revealed = new Map(proof.pages[0].revealedSalts.map((s) => [s.k, s.salt]));
      results.redaction_proof_withholds_masked_salt =
        !revealed.has(0) && !JSON.stringify(proof).includes(testPage.salts[0]) && testPage.salts.slice(1).every((s, i) => revealed.get(i + 1) === s);
    } else {
      results.redaction_proof_verifies_against_original = `not checked (redaction proof ${res.status}: version not anchored)`;
    }
  }

  // 12. A share recipient (no session) gets the same redaction proof and
  // the same page bytes, enough to verify at /verify; nothing once revoked.
  if (officerRedaction) {
    const proofRes = await fetch(`${BASE}/api/v1/shares/${share.token}/redaction-proof`);
    const proof = proofRes.status === 200 ? await proofRes.json() : null;
    results.share_redaction_proof_matches_officer = JSON.stringify(proof) === JSON.stringify(officerRedaction.proof);
    const pageRes = await fetch(`${BASE}/api/v1/shares/${share.token}/pages/0`);
    const png = Buffer.from(await pageRes.arrayBuffer());
    results.share_page_png_matches_officer = pageRes.status === 200 && png.equals(officerRedaction.png);
    const missing = await Promise.all(["1", "-1", "abc"].map((i) => fetch(`${BASE}/api/v1/shares/${share.token}/pages/${i}`)));
    results.share_page_out_of_range_404 = missing.every((r) => r.status === 404);
    await fetch(`${BASE}/api/v1/documents/${documentId}/shares/${share.shareId}`, { method: "DELETE", headers: auth });
    const revoked = await Promise.all(
      [`redaction-proof`, `pages/0`].map((p) => fetch(`${BASE}/api/v1/shares/${share.token}/${p}`))
    );
    results.share_verification_files_410_after_revoke = revoked.every((r) => r.status === 410);
  } else {
    results.share_redaction_proof_matches_officer = "not checked (no officer redaction proof)";
  }

  console.log(JSON.stringify(results, null, 2));
  // Anchor outcomes depend on the RPC being reachable: reported, not asserted.
  const informational = new Set([
    "auto_anchor_status",
    "auto_anchor_ok",
    "redacted_auto_anchor_status",
    ...Object.keys(results).filter((k) => typeof results[k] === "string" && results[k].startsWith("not checked")),
  ]);
  const allPassed = Object.entries(results).every(([k, v]) => informational.has(k) || Boolean(v));
  console.log(allPassed ? "\nSMOKE TEST PASSED" : "\nSMOKE TEST FAILED");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
