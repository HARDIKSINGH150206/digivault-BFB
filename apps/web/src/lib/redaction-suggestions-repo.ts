import { prisma } from "./prisma";
import type { AiSuggestion } from "./ai-service";

/** Maps ai-service's (pageIndex, row, col) suggestions onto one version's Tile rows and persists them. */
export async function persistSuggestionsAsFlags(documentVersionId: string, suggestions: AiSuggestion[]): Promise<number> {
  if (suggestions.length === 0) return 0;

  const tiles = await prisma.tile.findMany({ where: { documentVersionId } });
  const tileIdByCoord = new Map(tiles.map((t) => [`${t.pageIndex}:${t.row}:${t.col}`, t.id]));

  const data = suggestions
    .map((s) => ({
      tileId: tileIdByCoord.get(`${s.pageIndex}:${s.row}:${s.col}`),
      entityType: s.entityType,
      confidenceScore: s.confidenceScore,
      masked: false,
      source: s.source,
      nameHashes: s.nameHashes,
    }))
    .filter(
      (f): f is { tileId: string; entityType: string; confidenceScore: number; masked: boolean; source: string; nameHashes: string[] } =>
        Boolean(f.tileId)
    );

  if (data.length === 0) return 0;
  await prisma.redactionFlag.createMany({ data });
  return data.length;
}
