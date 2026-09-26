# 02 — Architecture & Data Flow

## System diagram (text form)

```
┌──────────────────────────────────────────────────────────────────────┐
│  OFFICER'S BROWSER (apps/web)                                        │
│                                                                        │
│   1. Upload file (scan or native PDF)                                │
│         │                                                             │
│         ▼                                                             │
│   2. PDF.js renders every page to <canvas>                           │
│         │                                                             │
│         ▼                                                             │
│   3. canvas.toDataURL("image/png")  — PNG ONLY, never JPEG           │
│         │                                                             │
│         ▼                                                             │
│   4. WebCrypto SHA-256 hash (client_hash) computed on the PNG        │
│         │                                                             │
│         ▼                                                             │
│   5. Canvas split into grid tiles (default 20x20 per page)           │
│         │                                                             │
│         ▼                                                             │
│   6. Each tile hashed → Merkle tree built → merkle_root computed     │
│         │                                                             │
│         └── all of steps 2–6 happen in packages/crypto-core,          │
│             shared between the main app and the verifier portal      │
│         │                                                             │
│         ▼                                                             │
│   7. Upload: PNG pages + client_hash + merkle_root + tile hashes     │
└────────────────────────────┬───────────────────────────────────────┘
                              │  POST /api/v1/evidence/upload
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  BACKEND (apps/web Next.js API routes + apps/ai-service FastAPI)     │
│                                                                        │
│   8. Backend RE-COMPUTES the hash server-side, compares to           │
│      client_hash. Mismatch = reject upload, do not proceed.          │
│         │                                                             │
│         ▼                                                             │
│   9. Document + tiles + merkle_root stored (Postgres via Prisma)     │
│         │                                                             │
│         ▼                                                             │
│  10. Async job queued: send PNG pages to ai-service                  │
│         │                                                             │
│         ▼                                                             │
│  11. ai-service: native text layer (if present) → else Bhashini OCR  │
│      → regex + IndicNER → tile-level redaction suggestions           │
│      (confidence-scored, fail-closed on low confidence)               │
│         │                                                             │
│         ▼                                                             │
│  12. Officer reviews/confirms suggested redactions in the UI         │
│      (human-in-the-loop — nothing finalizes silently)                │
│         │                                                             │
│         ▼                                                             │
│  13. On confirm: redacted tiles replaced with hash-only leaves,      │
│      merkle_root recomputed for the redacted version                 │
│         │                                                             │
│         ▼                                                             │
│  14. DUAL ANCHOR:                                                     │
│      (a) merkle_root → MinIO, Object Lock / Compliance mode          │
│      (b) merkle_root → Polygon Amoy testnet, EvidenceAnchor.sol      │
│         │                                                             │
│         ▼                                                             │
│  15. Insert-only audit_log row written for every action              │
│         │                                                             │
│         ▼                                                             │
│  16. Officer can generate a BSA 2023 certificate referencing the     │
│      merkle_root, ready for signature                                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  ANYONE, NO LOGIN (apps/web/src/app/verify — public route)           │
│                                                                        │
│  A. Drag in redacted PNG + JSON proof (merkle path, root, tx hash)   │
│  B. Recompute merkle_root client-side from the PNG                   │
│  C. Check recomputed root against (a) the JSON proof and             │
│     (b) the Polygon Amoy transaction, fetched via public RPC         │
│  D. Show "Verified" or "Mismatch" — zero calls to DigiVault's own    │
│     backend, zero database query                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Role-based access control (RBAC)

Five roles: `POLICE_OFFICER`, `INVESTIGATING_OFFICER`, `COURT_OFFICIAL`, `FORENSIC_LAB`, `ADMIN`. Enforced at the API middleware layer on every route — see `08-backend-design.md`.

## The one rule that overrides everything else in this diagram

**Steps 2–9 (rasterization → hashing → Merkle tree → storage) must never depend on steps 10–13 (OCR/NER/redaction) succeeding.** If Bhashini's API times out, if OCR misreads a coffee-stained scan, if IndicNER has low confidence on every tile — the document is still uploaded, still hashed, still tamper-evident. Redaction quality can degrade gracefully. Cryptographic integrity cannot degrade at all. See `03-crypto-and-merkle-spec.md` for the exact reasoning.
