export interface TileHash {
  /** Global index across the whole document version: page-major, row-major within a page. */
  index: number;
  pageIndex: number;
  row: number;
  col: number;
  hashHex: string;
}

export interface PageRaster {
  pageIndex: number;
  widthPx: number;
  heightPx: number;
  /** Lossless PNG bytes for this page — the only format ever stored or hashed at the page level. */
  pngBytes: Uint8Array;
}

export interface DocumentHashResult {
  gridSize: number;
  pageCount: number;
  /** SHA-256 over the length-prefixed concatenation of every page's PNG bytes, in page order. */
  clientHash: string;
  /** Merkle root over every tile's raw-pixel hash, in global tile order. */
  merkleRoot: string;
  tiles: TileHash[];
  pages: Pick<PageRaster, "pageIndex" | "widthPx" | "heightPx">[];
}
