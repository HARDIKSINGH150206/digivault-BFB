import base64
import binascii

from fastapi import FastAPI, HTTPException

from .real_suggestions import generate_suggestions
from .schemas import SuggestionRequest, SuggestionResponse

app = FastAPI(title="DigiVault AI Service", description="STUB — fake suggestions, real interface contract.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/redaction-suggestions", response_model=SuggestionResponse)
def redaction_suggestions(req: SuggestionRequest) -> SuggestionResponse:
    for page in req.pages:
        try:
            if len(base64.b64decode(page.png_base64, validate=True)) == 0:
                raise ValueError("empty PNG")
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=422, detail=f"page {page.page_index}: invalid png_base64 ({exc})"
            ) from exc

    suggestions = generate_suggestions(req.document_version_id, req.grid_size, req.pages)
    return SuggestionResponse(document_version_id=req.document_version_id, status="ready", suggestions=suggestions)
