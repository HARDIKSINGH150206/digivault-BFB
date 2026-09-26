import { sha256, toHex } from "./hash";
import type { TileHash } from "./types";

/**
 * Splits a rendered page canvas into a gridSize x gridSize grid and hashes
 * each tile's RAW pixel bytes (not a re-encoded PNG). This is deliberate:
 * the page-level PNG is what's stored/transported (lossless, so any
 * decoder reproduces bit-identical pixels), but re-encoding each small tile
 * crop as its own PNG would let encoder differences between browsers change
 * tile hashes without any real pixel change. Hashing raw ImageData bytes
 * keeps tile hashes portable and reproducible by any independent verifier
 * that decodes the same PNG. See docs/03-crypto-and-merkle-spec.md.
 */
export async function hashTiles(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  pageIndex: number,
  gridSize: number,
  globalIndexOffset: number
): Promise<TileHash[]> {
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error("Could not acquire 2D canvas context for tiling");

  const width = canvas.width;
  const height = canvas.height;
  const tileW = Math.ceil(width / gridSize);
  const tileH = Math.ceil(height / gridSize);

  const results: TileHash[] = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = col * tileW;
      const y = row * tileH;
      const w = Math.min(tileW, width - x);
      const h = Math.min(tileH, height - y);

      // Zero-area tiles can occur when width/height isn't evenly divisible
      // by gridSize on the last row/col; hash an empty buffer deterministically.
      const pixels =
        w > 0 && h > 0
          ? (ctx.getImageData(x, y, w, h).data as Uint8ClampedArray)
          : new Uint8ClampedArray(0);

      const hashBytes = await sha256(new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));

      const localIndex = row * gridSize + col;
      results.push({
        index: globalIndexOffset + localIndex,
        pageIndex,
        row,
        col,
        hashHex: toHex(hashBytes),
      });
    }
  }

  return results;
}
