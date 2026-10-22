import type { CaseGazetteer } from "./gazetteer";

/**
 * HTTP client for apps/ai-service, the bilingual (English + Hindi) NER
 * redaction service (see apps/ai-service/app/real_suggestions.py). CLAUDE.md rule 2:
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
  /** Keyed hashes of the names the tile covers (ADR-034); never the names themselves. */
  nameHashes: string[];
}

export async function requestRedactionSuggestions(
  documentVersionId: string,
  gridSize: number,
  pages: { pageIndex: number; widthPx: number; heightPx: number; pngBytes: Buffer }[],
  gazetteer: CaseGazetteer | null = null
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
      ...(gazetteer ? { gazetteer } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    throw new Error(`ai-service returned ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    suggestions: {
      page_index: number;
      row: number;
      col: number;
      entity_type: string;
      confidence_score: number;
      source: string;
      name_hashes?: unknown;
    }[];
  };

  return body.suggestions.map((s) => ({
    pageIndex: s.page_index,
    row: s.row,
    col: s.col,
    entityType: s.entity_type,
    confidenceScore: s.confidence_score,
    source: s.source,
    nameHashes: Array.isArray(s.name_hashes)
      ? s.name_hashes.filter((h): h is string => typeof h === "string" && /^[0-9a-f]{64}$/.test(h))
      : [],
  }));
}
