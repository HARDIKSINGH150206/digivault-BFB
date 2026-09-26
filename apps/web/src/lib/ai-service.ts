/**
 * Real HTTP client for apps/ai-service (currently a stub — see
 * apps/ai-service/app/fake_suggestions.py — but this contract is meant to
 * survive the swap to real Bhashini/IndicNER unchanged). CLAUDE.md rule 2:
 * whatever this returns is suggestion-only. The caller (upload route) is
 * responsible for making sure a failure/timeout here never blocks the
 * upload/hash pipeline that already committed before this is called.
 */

export interface AiSuggestion {
  pageIndex: number;
  row: number;
  col: number;
  entityType: string;
  confidenceScore: number;
  source: string;
}

export async function requestRedactionSuggestions(
  documentVersionId: string,
  gridSize: number,
  pages: { pageIndex: number; widthPx: number; heightPx: number; pngBytes: Buffer }[]
): Promise<AiSuggestion[]> {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) throw new Error("AI_SERVICE_URL is not set");

  const res = await fetch(`${baseUrl}/v1/redaction-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_version_id: documentVersionId,
      grid_size: gridSize,
      pages: pages.map((p) => ({
        page_index: p.pageIndex,
        width_px: p.widthPx,
        height_px: p.heightPx,
        png_base64: p.pngBytes.toString("base64"),
      })),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`ai-service returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    suggestions: { page_index: number; row: number; col: number; entity_type: string; confidence_score: number; source: string }[];
  };

  return body.suggestions.map((s) => ({
    pageIndex: s.page_index,
    row: s.row,
    col: s.col,
    entityType: s.entity_type,
    confidenceScore: s.confidence_score,
    source: s.source,
  }));
}
