import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256, toHex } from "../src/hash";

describe("sha256", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gives the same digest without WebCrypto (plain-http pages, e.g. a phone on a LAN IP)", async () => {
    const data = new Uint8Array(100_003).map((_, i) => (i * 31) & 0xff);
    const view = new Uint8Array(data.buffer, 7, 50_000);
    const withSubtle = [toHex(await sha256(data)), toHex(await sha256(view)), toHex(await sha256(data.buffer))];

    vi.stubGlobal("crypto", {});
    const without = [toHex(await sha256(data)), toHex(await sha256(view)), toHex(await sha256(data.buffer))];

    expect(without).toEqual(withSubtle);
    expect(toHex(await sha256(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
