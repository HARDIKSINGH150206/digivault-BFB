from typing import Literal

from pydantic import BaseModel, Field

# Sources match the free-text values RedactionFlag.source is documented to
# hold in prisma/schema.prisma ("text_layer" | "bhashini_ocr" | "indicner").
Source = Literal["text_layer", "bhashini_ocr", "indicner"]


class PageInput(BaseModel):
    page_index: int
    width_px: int
    height_px: int
    # Whole-page PNG, not pre-cropped per-tile images. Deliberate, and not
    # just a stub shortcut: OCR/NER need contiguous page text to find
    # entities that span tile boundaries — cropping to individual tiles
    # first would break that for the real implementation too. This service
    # crops internally once it actually needs pixels.
    png_base64: str


class SuggestionRequest(BaseModel):
    document_version_id: str
    grid_size: int
    pages: list[PageInput]


class Suggestion(BaseModel):
    page_index: int
    row: int
    col: int
    entity_type: str
    confidence_score: float = Field(ge=0, le=1)
    source: Source


class SuggestionResponse(BaseModel):
    document_version_id: str
    status: Literal["ready", "failed"]
    suggestions: list[Suggestion]
