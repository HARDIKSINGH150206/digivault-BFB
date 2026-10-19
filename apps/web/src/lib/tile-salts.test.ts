import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSaltSet, encryptSaltSet, generateTileSalts, revealableSalts, saltKeyFromEnv, SALT_BYTES } from "./tile-salts";

const key = { id: "k1", key: randomBytes(32) };

describe("tile salts", () => {
  it("generates distinct 32-byte salts", () => {
    const salts = generateTileSalts(400);
    expect(salts).toHaveLength(400);
    expect(salts.every((s) => s.length === SALT_BYTES)).toBe(true);
    expect(new Set(salts.map((s) => s.toString("hex"))).size).toBe(400);
  });

  it("round-trips through encryption", () => {
    const salts = generateTileSalts(5);
    const set = encryptSaltSet("ver_1", salts, key);
    expect(set.ciphertext.includes(salts[0])).toBe(false);
    expect(decryptSaltSet("ver_1", set, key).map((s) => s.toString("hex"))).toEqual(salts.map((s) => s.toString("hex")));
  });

  it("refuses a blob moved to another version", () => {
    const set = encryptSaltSet("ver_1", generateTileSalts(5), key);
    expect(() => decryptSaltSet("ver_2", set, key)).toThrow();
  });

  it("refuses a tampered blob or wrong key", () => {
    const set = encryptSaltSet("ver_1", generateTileSalts(5), key);
    const tampered = { ...set, ciphertext: Buffer.from(set.ciphertext) };
    tampered.ciphertext[0] ^= 1;
    expect(() => decryptSaltSet("ver_1", tampered, key)).toThrow();
    expect(() => decryptSaltSet("ver_1", set, { id: "k1", key: randomBytes(32) })).toThrow();
    expect(() => decryptSaltSet("ver_1", set, { id: "k2", key: key.key })).toThrow(/key "k1"/);
  });

  it("never reveals masked tiles' salts", () => {
    const salts = generateTileSalts(6);
    const out = revealableSalts(salts, [1, 4]);
    expect(out.map((s) => s.k)).toEqual([0, 2, 3, 5]);
    const revealed = out.map((s) => s.salt).join("");
    expect(revealed.includes(salts[1].toString("hex"))).toBe(false);
    expect(revealed.includes(salts[4].toString("hex"))).toBe(false);
    expect(() => revealableSalts(salts, [6])).toThrow(/out of range/);
  });

  it("validates the env key", () => {
    expect(() => saltKeyFromEnv({})).toThrow(/SALT_ENCRYPTION_KEY/);
    expect(() => saltKeyFromEnv({ SALT_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
    expect(saltKeyFromEnv({ SALT_ENCRYPTION_KEY: randomBytes(32).toString("base64") }).id).toBe("k1");
  });
});
