"""
STUB entity-detection logic — plausible, schema-correct FAKE data, not real
Bhashini OCR or IndicNER. The point of this module is the seam: everything
outside `generate_suggestions()` (schemas.py, main.py, and the backend's
consumer in apps/web/src/lib/ai-service.ts) is written against the real
interface contract already. Swapping in real Bhashini/IndicNER later means
replacing this function's body only — nothing else should need to change.

CLAUDE.md rule 2 still applies here even though this is fake: whatever this
returns is suggestion-only. It is never hashed, and a failure/timeout here
must never be allowed to block the upload/hash pipeline (enforced on the
caller's side, apps/web's upload route, which wraps the HTTP call in a
try/catch and continues regardless).
"""

import hashlib
import random

from .schemas import PageInput, Suggestion

ENTITY_TYPES = ["victim_name", "phone", "address", "age", "witness_name", "relative_name"]
SOURCES = ["text_layer", "bhashini_ocr", "indicner"]


def generate_suggestions(document_version_id: str, grid_size: int, pages: list[PageInput]) -> list[Suggestion]:
    suggestions: list[Suggestion] = []

    for page in pages:
        # Deterministic per (document_version_id, page_index) so repeated
        # calls for the same input are stable — easier to demo/debug than
        # pure randomness, and mirrors crypto-core's own determinism checks.
        seed_input = f"{document_version_id}:{page.page_index}".encode()
        seed = int(hashlib.sha256(seed_input).hexdigest(), 16) % (2**32)
        rng = random.Random(seed)

        seen: set[tuple[int, int]] = set()
        for _ in range(rng.randint(3, 7)):
            row, col = rng.randint(0, grid_size - 1), rng.randint(0, grid_size - 1)
            if (row, col) in seen:
                continue
            seen.add((row, col))

            # Deliberate mix of high- and low-confidence suggestions, so
            # the frontend's fail-closed handling (step 6) has something
            # realistic to branch on instead of uniformly "confident" fake data.
            is_high_confidence = rng.random() < 0.6
            confidence = rng.uniform(0.85, 0.99) if is_high_confidence else rng.uniform(0.25, 0.65)

            suggestions.append(
                Suggestion(
                    page_index=page.page_index,
                    row=row,
                    col=col,
                    entity_type=rng.choice(ENTITY_TYPES),
                    confidence_score=round(confidence, 3),
                    source=rng.choice(SOURCES),
                )
            )

    return suggestions
