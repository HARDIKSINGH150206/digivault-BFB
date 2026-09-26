<div align="center">

<img src="https://img.shields.io/badge/DigiVault-v1.0-0052CC?style=for-the-badge" alt="DigiVault"/>

# DigiVault

### Tamper-Evident Digital Evidence Management for Indian Law Enforcement

*Built for NCRB Women Safety Division · Ministry of Home Affairs*

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Polygon](https://img.shields.io/badge/Polygon-Amoy-8247E5?style=flat-square&logo=polygon)](https://polygon.technology)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## The Problem

Every FIR, witness statement, and forensic report in India's criminal justice system passes through dozens of hands before a case reaches court. Each handoff is a tampering opportunity — and today there is no cryptographic proof that a document presented in court is identical to the one filed at the police station.

For the NCRB Women Safety Division this matters more than anywhere else. **Section 228A IPC** criminalises the disclosure of a sexual assault victim's identity. Yet the current workflow — paper files, scanned PDFs, WhatsApp attachments — offers no automated redaction, no field-level access control, and no audit trail that could withstand legal scrutiny.

DigiVault was built to fix this.

---

## What DigiVault Does

| Capability | How |
|---|---|
| **Tamper-evident storage** | Every file version is SHA-256 hashed and chained — `hash(N) = sha256(prev_hash ‖ file_hash ‖ version ‖ timestamp)`. Any modification breaks the chain. |
| **External hash anchoring** | Chain root is periodically anchored to Polygon Amoy testnet — an insider with DB root access cannot silently regenerate a valid chain. |
| **Auto-redaction** | Bilingual NER engine (spaCy + regex, English + Hindi/Devanagari) flags victim names, Aadhaar numbers, phone numbers, addresses and FIR numbers before any export or share. |
| **Step-up biometrics** | Face liveness check at login, case-open, document sign and export — not continuous monitoring. Each check is logged in the audit trail. |
| **Insert-only audit log** | Every view, upload, share and export is appended, never updated or deleted. |
| **Role-based access** | Five roles — Police Officer, Investigating Officer, Court Official, Forensic Lab, Admin — with field-level visibility controls for victim-identifying data. |
| **Court-ready export** | One-click signed PDF bundle: documents + chain-of-custody log + hash verification certificate. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│          Next.js 15  ·  TypeScript  ·  Tailwind CSS         │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST / tRPC
┌───────────────────────────▼─────────────────────────────────┐
│                       API Layer (Next.js)                    │
│   Auth (JWT + RBAC)  ·  Hash Chain  ·  Audit Log  ·  Search │
│                    PostgreSQL  ·  Prisma ORM                 │
└────────┬──────────────────┬──────────────────┬──────────────┘
         │                  │                  │
┌────────▼───────┐  ┌───────▼──────┐  ┌────────▼──────────────┐
│  File Storage  │  │  AI Service  │  │  Blockchain Anchor     │
│  (MinIO / S3)  │  │  FastAPI     │  │  Polygon Amoy (EVM)    │
│  AES-256 rest  │  │  Python 3.12 │  │  Solidity contract     │
└────────────────┘  └───────┬──────┘  └────────────────────────┘
                            │
                   ┌────────▼──────────────────┐
                   │  NER Redaction Pipeline    │
                   │  pytesseract (eng+hin)     │
                   │  spaCy en_core_web_sm      │
                   │  24 regex patterns (EN+HI) │
                   └────────────────────────────┘
```

The AI service is a **strict read-only consumer** of the document bytes. It decodes the PNG page image, runs OCR and NER, and returns tile coordinates for the frontend to overlay redaction boxes. It never touches the hash chain.

---

## Redaction Engine

The auto-redaction pipeline (`apps/ai-service/app/real_suggestions.py`) runs entirely offline — no external API calls, no third-party data sharing.

### Detection sources

| Source | What it catches |
|---|---|
| **spaCy `en_core_web_sm`** | PERSON, GPE, LOC, ORG entities in English text |
| **English regex (15 patterns)** | Indian mobile numbers, Aadhaar, PAN, passport, FIR/case numbers, email, DOB, age, vehicle registration, victim names via S/O · D/O · W/O, complainant keyword pattern |
| **Hindi/Devanagari regex (9 patterns)** | Phone after मोबाइल/दूरभाष, Aadhaar after आधार संख्या, age (आयु/उम्र), victim/accused names after पीड़िता/आरोपी/साक्षी, father-name via पुत्र/पुत्री/पिता, address after निवास/पता/थाना, FIR number via मु.अ.सं., DOB via जन्म तिथि, Devanagari-digit phones |

### Pipeline

```
PNG page image (base64)
        │
        ▼
pytesseract OCR  ─── eng+hin lang pack, LSTM engine (--oem 3)
        │              line-aware output (real \n, not space-joined)
        ▼
spaCy NER ──────────── English entities
        +
Regex NER ──────────── English + Hindi/Devanagari patterns
        │
        ▼
Priority-based dedup ── aadhaar/pan/passport > phone > name > age > address > dob
        │               full bounding-box tile coverage (not centre-only)
        ▼
Suggestion list ──────── [{page, row, col, entity_type, confidence, source}]
```

**Failure contract:** per-page errors are caught and logged. A redaction failure never blocks the upload or hash pipeline.

---

## Repo Structure

```
digivault/
├── apps/
│   ├── web/                    # Next.js 15 frontend + API routes
│   │   ├── src/app/            # App Router pages
│   │   ├── src/lib/            # Auth, hash chain, audit log
│   │   └── prisma/             # Schema + migrations
│   └── ai-service/             # FastAPI redaction microservice
│       ├── app/
│       │   ├── main.py         # /health + /v1/redaction-suggestions
│       │   ├── real_suggestions.py  # Bilingual NER pipeline
│       │   └── schemas.py      # Pydantic models
│       └── requirements.txt
├── contracts/                  # Solidity hash-anchor contract (Polygon)
└── scripts/                    # Dev utilities
```

---

## Quick Start

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| Python | 3.12+ |
| PostgreSQL | 14+ |
| tesseract-ocr | 5.x with `eng` + `hin` packs |

### 1. Clone and install

```bash
git clone https://github.com/HARDIKSINGH150206/digivault.git
cd digivault

# Frontend
cd apps/web && npm install

# AI service (uv recommended)
cd ../ai-service
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 2. Install Tesseract (Ubuntu/Debian)

```bash
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin
```

### 3. Environment variables

```bash
# apps/web/.env.local
DATABASE_URL="postgresql://user:pass@localhost:5432/digivault"
JWT_SECRET="your-secret-here"
NEXT_PUBLIC_AI_SERVICE_URL="http://localhost:8000"

# apps/ai-service/.env
# (no required vars — model and tesseract are local)
```

### 4. Database

```bash
cd apps/web
npx prisma migrate dev
npx prisma db seed          # optional demo data
```

### 5. Run

```bash
# Terminal 1 — AI service
cd apps/ai-service && uvicorn app.main:app --reload --port 8000

# Terminal 2 — Web app
cd apps/web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Reference

### AI Service

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Liveness check → `{"status": "ok"}` |
| `/v1/redaction-suggestions` | POST | Run NER on page images, return tile coordinates |

**POST `/v1/redaction-suggestions`**

```json
{
  "document_version_id": "uuid",
  "grid_size": 20,
  "pages": [
    {
      "page_index": 0,
      "width_px": 1240,
      "height_px": 1754,
      "png_base64": "<base64-encoded PNG>"
    }
  ]
}
```

Response:

```json
{
  "document_version_id": "uuid",
  "status": "ready",
  "suggestions": [
    {
      "page_index": 0,
      "row": 3,
      "col": 4,
      "entity_type": "victim_name",
      "confidence_score": 0.91,
      "source": "text_layer"
    }
  ]
}
```

Entity types: `victim_name` · `phone` · `aadhaar` · `pan` · `passport` · `email` · `case_number` · `dob` · `age` · `address` · `vehicle_reg`

---

## Compliance & Legal Basis

| Requirement | Implementation |
|---|---|
| Section 228A IPC — victim identity | Auto-redaction engine; unredacted original gated behind Case Owner role |
| DPDP Act 2023 — data minimisation | Field-level RBAC; no continuous biometric collection |
| Chain of custody | Append-only audit log; SHA-256 hash chain per document version |
| Court admissibility | Signed PDF export bundle with hash verification certificate |

---

## Roadmap

- [ ] Devanagari-native OCR via Bhashini API (CDAC/MeitY) for improved accuracy on handwritten Hindi FIRs
- [ ] QR-linked physical evidence chain-of-custody (scan at each seizure → lab → court handoff)
- [ ] Anomaly detection on the audit log (unusual access volume, off-hours downloads, out-of-team access)
- [ ] ICJS-compatible metadata schema for interoperability with the national Criminal Justice System
- [ ] Offline-first mobile upload for field officers with poor connectivity
- [ ] Multi-level approval workflow (IO → SP → Legal Officer sign-off)

---

## Built With

- [Next.js 15](https://nextjs.org) — React framework with App Router
- [FastAPI](https://fastapi.tiangolo.com) — Python API for the NER microservice
- [PostgreSQL](https://postgresql.org) + [Prisma](https://prisma.io) — Relational database and ORM
- [spaCy](https://spacy.io) `en_core_web_sm` — English NER model
- [pytesseract](https://github.com/madmaze/pytesseract) — Python wrapper for Tesseract OCR
- [Polygon Amoy](https://polygon.technology) — EVM testnet for hash anchoring
- [Tailwind CSS](https://tailwindcss.com) — Utility-first styling

---

## License

MIT © 2026 Hardik Singh

---

<div align="center">
<sub>Built for Build for Billions 2026 · NCRB Women Safety Division · Ministry of Home Affairs</sub>
</div>