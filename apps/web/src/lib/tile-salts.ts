import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Per-tile leaf salts (ADR-018, docs/07 Phase 1/3).
 *
 * - One random 32-byte salt per tile; a version's salts are stored as one
 *   AES-256-GCM blob in VersionSaltSet (insert-only for the app role).
 * - Associated data "<documentVersionId>|<tileCount>" binds the blob to its
 *   version, so it can't be copied onto another version undetected.
 * - Key: SALT_ENCRYPTION_KEY (base64, 32 bytes), identified by
 *   SALT_ENCRYPTION_KEY_ID (default "k1"). Generate with
 *   `openssl rand -base64 32`. Losing the key makes every salted version's
 *   commitment unverifiable — back it up like the anchoring key.
 * - revealableSalts() is the ONLY way salts are selected for anything that
 *   leaves the server; masked tiles' salts are never included.
 */

export const SALT_BYTES = 32;

export interface SaltKey {
  id: string;
  key: Buffer;
}

export function saltKeyFromEnv(env: Record<string, string | undefined> = process.env): SaltKey {
  const raw = env.SALT_ENCRYPTION_KEY;
  if (!raw) throw new Error("SALT_ENCRYPTION_KEY is not set (base64 of 32 random bytes: `openssl rand -base64 32`).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SALT_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return { id: env.SALT_ENCRYPTION_KEY_ID || "k1", key };
}

export function generateTileSalts(tileCount: number): Buffer[] {
  return Array.from({ length: tileCount }, () => randomBytes(SALT_BYTES));
}

function aad(documentVersionId: string, tileCount: number): Buffer {
  return Buffer.from(`${documentVersionId}|${tileCount}`, "utf8");
}

export interface EncryptedSaltSet {
  tileCount: number;
  keyId: string;
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

export function encryptSaltSet(documentVersionId: string, salts: Buffer[], key: SaltKey): EncryptedSaltSet {
  if (salts.length === 0) throw new Error("No salts to encrypt.");
  if (salts.some((s) => s.length !== SALT_BYTES)) throw new Error(`Every salt must be ${SALT_BYTES} bytes.`);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  cipher.setAAD(aad(documentVersionId, salts.length));
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat(salts)), cipher.final()]);
  return { tileCount: salts.length, keyId: key.id, iv, ciphertext, authTag: cipher.getAuthTag() };
}

export function decryptSaltSet(documentVersionId: string, set: EncryptedSaltSet, key: SaltKey): Buffer[] {
  if (set.keyId !== key.id) throw new Error(`Salt set was encrypted with key "${set.keyId}", but key "${key.id}" is loaded.`);
  const decipher = createDecipheriv("aes-256-gcm", key.key, set.iv);
  decipher.setAAD(aad(documentVersionId, set.tileCount));
  decipher.setAuthTag(set.authTag);
  const plain = Buffer.concat([decipher.update(set.ciphertext), decipher.final()]);
  if (plain.length !== set.tileCount * SALT_BYTES) throw new Error("Decrypted salt set has the wrong length.");
  return Array.from({ length: set.tileCount }, (_, i) => plain.subarray(i * SALT_BYTES, (i + 1) * SALT_BYTES));
}

/**
 * Salts that may leave the server for a redaction proof: every tile EXCEPT
 * the masked ones, as { k, salt } in tileIndex order.
 */
export function revealableSalts(salts: Buffer[], maskedTileIndices: Iterable<number>): { k: number; salt: string }[] {
  const masked = new Set(maskedTileIndices);
  for (const k of masked) {
    if (!Number.isInteger(k) || k < 0 || k >= salts.length) throw new Error(`Masked tile index ${k} is out of range.`);
  }
  return salts.flatMap((salt, k) => (masked.has(k) ? [] : [{ k, salt: salt.toString("hex") }]));
}

/**
 * Stores a version's salts. Write-once: the DB role can't update or delete
 * them. Pass the transaction client so the version and its salts are
 * created together — a v2 version without salts could never be verified.
 */
export async function storeVersionSalts(
  documentVersionId: string,
  salts: Buffer[],
  key: SaltKey = saltKeyFromEnv(),
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  const set = encryptSaltSet(documentVersionId, salts, key);
  await db.versionSaltSet.create({ data: { documentVersionId, ...set } });
}

/** Loads and decrypts a version's salts, or null if the version has none (v1 / unsalted). */
export async function loadVersionSalts(documentVersionId: string, key: SaltKey = saltKeyFromEnv()): Promise<Buffer[] | null> {
  const row = await prisma.versionSaltSet.findUnique({ where: { documentVersionId } });
  if (!row) return null;
  return decryptSaltSet(
    documentVersionId,
    { tileCount: row.tileCount, keyId: row.keyId, iv: Buffer.from(row.iv), ciphertext: Buffer.from(row.ciphertext), authTag: Buffer.from(row.authTag) },
    key
  );
}
