import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveCaseKey, gazetteerKeyFromEnv } from "./gazetteer";

// Shared with apps/ai-service/tests/test_gazetteer.py, which checks the name
// hashes made with these case keys (ADR-034).
const vectors = JSON.parse(
  readFileSync(path.join(__dirname, "../../../ai-service/tests/gazetteer_vectors.json"), "utf8")
) as {
  master_key_b64: string;
  cases: { case_id: string; case_key_b64: string }[];
  names: { text: string; name_hash: Record<string, string> }[];
};

describe("deriveCaseKey", () => {
  const master = Buffer.from(vectors.master_key_b64, "base64");

  it("matches the shared vectors", () => {
    for (const c of vectors.cases) {
      expect(deriveCaseKey(master, c.case_id).toString("base64")).toBe(c.case_key_b64);
    }
  });

  it("gives each case its own key, so the same name hashes differently per case", () => {
    const [a, b] = vectors.cases;
    expect(deriveCaseKey(master, a.case_id).equals(deriveCaseKey(master, b.case_id))).toBe(false);
    for (const n of vectors.names) expect(n.name_hash[a.case_id]).not.toBe(n.name_hash[b.case_id]);
  });

  it("depends on the master key", () => {
    const other = Buffer.alloc(32, 7);
    expect(deriveCaseKey(other, "case-A").equals(deriveCaseKey(master, "case-A"))).toBe(false);
  });
});

describe("gazetteerKeyFromEnv", () => {
  it("is off when unset or the wrong length", () => {
    expect(gazetteerKeyFromEnv({})).toBeNull();
    expect(gazetteerKeyFromEnv({ GAZETTEER_KEY: Buffer.alloc(16).toString("base64") })).toBeNull();
  });

  it("reads a 32-byte key and its id", () => {
    const gk = gazetteerKeyFromEnv({ GAZETTEER_KEY: Buffer.alloc(32, 1).toString("base64"), GAZETTEER_KEY_ID: "g2" });
    expect(gk?.id).toBe("g2");
    expect(gk?.key.length).toBe(32);
    expect(gazetteerKeyFromEnv({ GAZETTEER_KEY: Buffer.alloc(32, 1).toString("base64") })?.id).toBe("g1");
  });
});
