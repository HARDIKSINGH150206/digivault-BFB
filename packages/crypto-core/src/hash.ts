/**
 * SHA-256 via WebCrypto. This is the only hashing entry point used for
 * anything that feeds the Merkle root or the client_hash — never OCR/AI
 * output, per CLAUDE.md rule 2.
 */
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const buf = data instanceof Uint8Array ? toArrayBuffer(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Guard against a view over a larger/shared buffer.
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Concatenate several byte buffers with a 4-byte big-endian length prefix
 * on each, so that e.g. hash([a,b]) can never collide with hash([a+b]) or
 * hash([b,a]) content shifted across a boundary.
 */
export function lengthPrefixedConcat(buffers: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const buf of buffers) {
    const lenPrefix = new Uint8Array(4);
    new DataView(lenPrefix.buffer).setUint32(0, buf.byteLength, false);
    parts.push(lenPrefix, buf);
  }
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}
