# 05 — Demo Golden Path

The one live demo sequence: what to prepare, what to click, what the audience should see, and what to do when something breaks. CLAUDE.md build step 7 runs this end to end. It replaces the draft in `docs/06` §10.

Every "Verified" or "Anchored" on screen comes from a real check against Polygon Amoy; nothing is mocked. Target length: **about 8 minutes**, plus 2 minutes of questions.

**Status (2026-10-22):**
- **Messy scan:** `apps/web/public/sample-firs/messy-fir.pdf` — synthetic English FIR, 3.2° skew, fold crease, coffee stain over the Aadhaar and address, heavy noise, JPEG page inside the PDF (`apps/ai-service/eval/messy.py`; gold labels in `messy-fir.gold.json`). In the app its suggestions cover 12/12 identifiers fully.
- **Demo documents:** all 9 have a current version in proof format v2, anchored on contract v2 (the legacy v1 version stays as version 1 of each chain; `seed-demo.ts` does this for any document still on v1).
- **Rehearsed twice** with `node scripts/golden-path.mjs` (10/10 steps passed both times, 44–52 s of machine time; the second run on the messy scan).
- **Cross-browser:** Chromium, Firefox and WebKit give identical results (`node scripts/e2e-three-browsers.mjs`, 2026-10-23): same vector outputs, same verdicts on a real anchored document and its redaction proof, same recomputed hash for a tampered page. Real Safari on an iPhone is still worth one look during the phone rehearsal.

---

## 1. Accounts

From `apps/web/prisma/seed-demo.ts` (named demo accounts). The `prisma/seed-for-testing.mjs` accounts (e.g. `DL/2019/3301`) also work but look like test data on screen.

| Role | Name | Service number | PIN |
|---|---|---|---|
| Investigating Officer | IO Rajiv Sharma | `UP/2021/4821` | `224466` |
| Court Official | Court Official Anand | `DL/2020/7755` | `446688` |
| Admin | SP Meera Iyer | `KA/2018/1042` | `112233` |

## 2. Before the demo (T−30 min)

| # | Step | Check |
|---|---|---|
| 1 | `docker compose up -d` | Postgres and MinIO up |
| 2 | AI service: `cd apps/ai-service && .venv/bin/uvicorn app.main:app --port 8001` | `GET :8001/docs` loads |
| 3 | Web app: `AMOY_RPC_URL=https://polygon-amoy.drpc.org AUDIT_ANCHOR_INTERVAL_HOURS=0 pnpm --filter @digivault/web dev` | `/verify` loads. The schedule is off so the audit anchor only runs when you trigger it in step 8. |
| 4 | Wallet balance ≥ 0.03 POL (one rehearsal uses ~0.008) | Polygonscan page for `0x30F5fD617B9f7f73eCED0FB37dB2cd7dFEB32873` |
| 5 | Seeds: `cd apps/web && node --experimental-strip-types prisma/seed-demo.ts && node scripts/seed-deadline-cases.mjs` | Dashboard shows the demo cases; deadline cases are dated from today |
| 6 | `pnpm audit:verify --onchain` | Exit 0, "audit log verified up to entry #N" |
| 7 | Phone on the same network; `PUBLIC_BASE_URL=http://<laptop LAN IP>:3000` in `apps/web/.env.local` (restart the web app) | Certificate QR opens on the phone (ADR-031: hashing works over plain HTTP) |
| 8 | Browser tabs: dashboard (logged in as the IO), an incognito window on `/verify`, the Polygonscan page for contract v2 `0x01e7e6f83f55873E906465d3447cB43434D4ee67` | — |
| 9 | Downloads folder empty, so the demo files are easy to find | — |
| 10 | Dry run: `cd apps/web && node scripts/golden-path.mjs` (uses the messy scan, works in a fresh REHEARSAL case, ~0.008 POL) | 10/10 steps pass |

## 3. The sequence

| # | Time | Do | Audience sees | Point to make |
|---|---|---|---|---|
| 1 | 0:00 | Landing page, one sentence of problem | — | Victim identity (BNS s.72) and admissible electronic evidence (BSA s.63) pull in opposite directions: copies must hide things, yet stay provably untouched. |
| 2 | 0:30 | Log in as the IO | Dashboard: cases with BNSS deadline badges; "Needs your attention" opens with deadline alerts, closest deadline first | BNSS s.193(2): two months for rape and POCSO investigations. Day 50 is amber, day 55 red. Only covered sections count (ADR-032). |
| 3 | 1:15 | Open a case → **Upload document** → choose the messy scan | "Rendering pages and computing fingerprints in your browser…", then "Uploading. The server is re-checking every fingerprint…", then the version page with the anchor pending | The browser hashes every page as a 20×20 grid of salted tiles; the server re-hashes from the raw pixels and rejects any mismatch (rule 4). OCR plays no part in the hash, so a coffee-stained scan is just as tamper-evident (rule 2). |
| 4 | 2:15 | Wait for **Anchored**; open the Polygonscan link | The anchor transaction on Amoy | Dual anchor: Polygon plus an Object-Locked MinIO copy (rule 3). Only a 32-byte commitment goes on chain, no content or PII. |
| 5 | 2:45 | Review the AI suggestions (name, phone, Aadhaar, each with confidence, source and a "high confidence" / "check" chip); untick anything wrong, add one tile by hand; **Create redacted version** → fingerprint or PIN | v2 created, anchored, linked to v1 in the version chain | AI only suggests; a human confirms, with step-up. The redacted copy is a new anchored version, not an overwrite. On the messy scan a few amber "Dob" boxes sit on the title row (the skewed date line shares that tile row) — unticking them is the point to make: review is mandatory. |
| 6 | 3:45 | On the redacted version page: **Download verification bundle**, **Download redaction proof**, **Download certificate** (step-up) | Page PNGs, `verification-proof.json`, the redaction proof, the s.63 certificate PDF with a QR | The certificate cites the anchored commitment and tx directly; a person still has to sign it (Part A and Part B). |
| 7 | 4:30 | Incognito `/verify`: drop the redaction proof and the redacted pages | **Verified redacted copy**, "Verified against official DigiVault contract" | A court can check, without logging in and without our server, that this redacted copy came from the anchored original and only the masked tiles changed (rule 5). |
| 8 | 5:15 | Drop a copy of a page with one pixel changed | **Mismatch**, naming the tile | Any change, however small, is found and located. |
| 9 | 5:45 | Scan the certificate QR with the phone | `/verify` on the phone: **Anchored** | The QR proves the commitment is on chain for that version. Checking the file itself needs the pages and proof (the page says so). |
| 10 | 6:30 | Log in as Admin → `/dashboard/audit` → **Anchor audit head now** (step-up) | "Audit log verified up to entry #N, anchored in block X" | Every action is in a hash-chained audit log whose head is anchored too. A corrupt admin with full database access can't rewrite history without the check naming where. |
| 11 | 7:15 | Log in as the Court Official, open the case | Read-only access: proof and certificate downloads, no upload or redaction | Five roles, enforced on every API route. |
| 12 | 7:45 | Close | — | Not a CCTNS replacement: a compliance and integrity layer that plugs into it. |

Making the one-pixel tamper copy before the demo (from `apps/web`, paths are examples):

```bash
node -e 'const sharp=require("sharp");sharp(process.argv[1]).ensureAlpha().raw().toBuffer({resolveWithObject:true}).then(({data,info})=>{data[0]^=0xff;return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(process.argv[2])})' page-1.png page-1-tampered.png
```

**Optional, only on a copy of the database:** edit one `AuditLog` row as the owner role and run `pnpm audit:verify --onchain`. It names the edited `seq` (Phase 4 done-when). Never do this on the demo database: the app role can't undo it and the chain stays broken.

## 4. When something breaks

| Symptom | Recovery |
|---|---|
| Anchor stays pending or shows FAILED | Retry from the version page. If the tx already landed it is reconciled without a new send (ADR-025). If drpc returns "code 19", wait 10 s and retry. Fallback: show a document seeded earlier that is already anchored. |
| No AI suggestions | The AI service is down or slow. Mark tiles by hand and say so; the hash never depended on it (rule 2). |
| Fingerprint prompt fails | **Use PIN instead** in the same dialog. |
| `/verify` says the RPC is not Polygon Amoy, or times out | The public RPC is down. Reload; the portal tries the configured RPC, then `rpc-amoy.polygon.technology`. |
| Phone can't open the QR link | Same Wi-Fi? Correct `PUBLIC_BASE_URL`? Otherwise open the link on the laptop's incognito window. |
| Out of POL | Faucet; meanwhile demo only on documents that are already anchored (steps 6–11 need no gas). |

## 5. Gas per run

| Step | Anchors | ≈ POL |
|---|---|---|
| 3–4 upload | 1 | 0.0031 |
| 5 redacted version | 1 | 0.0031 |
| 10 audit head | 1 | 0.0015 |
| **Total per rehearsal** | 3 | **≈ 0.008** |

Measured 2026-10-22 at the 30 gwei priority cap: a document anchor, which also carries the current audit head, uses ~102k gas = 0.0031 POL; a standalone audit-head anchor ~50k gas = 0.0015 POL. (Earlier notes said 0.0015 for every anchor; that was the audit-only figure.)
