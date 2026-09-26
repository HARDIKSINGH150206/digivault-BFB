# 01 — Problem, Legal Context & Novelty

Read this first. It's the "why" behind every architectural rule in this repo — if you understand this, the rest of the docs will make sense instead of looking arbitrary.

## The problem

Investigating Officers, Court Officials, Forensic Labs, and Admins at NCRB's Women Safety Division struggle to manage case documents (FIRs, charge sheets, witness statements, forensic reports) securely and traceably. Storage is fragmented, access is loosely controlled, there's no tamper-evidence or audit trail. This causes delayed investigations, compromised evidence integrity, and compliance exposure.

## The two legal anchors that drive the architecture

### Section 228A, IPC — victim identity protection
Criminalizes disclosing a sexual assault victim's identity. Any exported, shared, or printed copy of a document must not expose victim-identifying fields (name, address, phone, age where identifying). **This is why redaction exists and why it defaults to fail-closed** — a false negative here isn't a UI bug, it's a legal violation.

### Bharatiya Sakshya Adhiniyam (BSA), 2023 — Sections 61 & 63
In force since July 1, 2024. Section 61 is the recognition clause (electronic records are admissible, same legal effect as physical documents). Section 63 sets certificate requirements for electronic evidence — the certificate must be signed by the person with lawful control of the device, and per some interpretations, a technical expert. **Software cannot self-certify evidence.** DigiVault auto-generates a pre-filled certificate; a human still signs it.

## Why this is genuinely novel (and what it is not)

Do NOT pitch this as "nobody has tamper-evidence" or "nobody has redaction" — both exist elsewhere (see competitive landscape below). The actual, defensible claim is narrower and stronger:

**No reviewed system combines all of the following, for this specific domain, in one place:**
1. Redaction that is cryptographically verifiable by a third party (not just "trust our masking")
2. Tamper-evidence that never depends on OCR succeeding (survives crooked/handwritten/coffee-stained scans)
3. An insider-threat-resistant ledger (defeats a corrupt admin with full DB access, not just external attackers)
4. A legal certificate that references the cryptographic proof directly, instead of sitting beside it as separate paperwork

## Competitive landscape (know this before anyone asks "why not just use X")

| System | What it is | Why DigiVault isn't redundant with it |
|---|---|---|
| CCTNS / ICJS | The real incumbent — 95% of police stations, mandatory nationwide from Jan 2027, NCRB is the implementing agency | DigiVault is a compliance/security layer designed to plug into this via API, **not a competitor**. Never pitch this as a CCTNS replacement. |
| VIDIZMO, Axon Evidence, Genetec Clearance, NICE Investigate, Motorola CommandCentral | Global digital evidence management vendors | CJIS-compliant baseline exists across all of these; VIDIZMO already has generic AI redaction. Not built for Indian legal codes, not third-party-verifiable, not ICJS-compatible. |
| LegitDoc (Zupple Labs) | Real Indian blockchain document-verification startup, piloted with Maharashtra govt | Generic certificate issuance (e.g. caste certificates), not case-lifecycle or redaction-aware. |

## Explicitly out of scope — do not build these, even if asked

- **Aadhaar-based login for officers or victims (production).** Requires UIDAI AUA/KUA accreditation — not achievable on this timeline. Simulate the UX if a demo needs it, and say plainly it's simulated.
- **Hyperledger Fabric or any permissioned blockchain network.** NCRB is a single trusted custodian — no multi-party consensus problem to solve. Solves a problem this project doesn't have.
- **Live interception of the real CCTNS system** (e.g. a browser extension reading/modifying CCTNS's own traffic). No sanctioned API access exists; this pattern also resembles malicious browser-extension behavior and is a security-governance risk, not just a technical one.
- **A national crime-pattern dashboard** (which state has more of which crime). Redundant with NCRB's own "Crime in India" report and methodologically risky (raw state comparisons reflect reporting diligence as much as actual crime rates).

See `05-demo-golden-path.md` for what actually gets built and demoed.
