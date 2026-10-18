import { parseUnits } from "ethers";
import { describe, expect, it } from "vitest";
import { anchorFeeCaps, capFees } from "./polygon";

const gwei = (n: string) => parseUnits(n, "gwei");

describe("anchor fee caps", () => {
  const caps = anchorFeeCaps({});

  it("defaults to 100 / 60 gwei", () => {
    expect(caps).toEqual({ maxFeePerGas: gwei("100"), maxPriorityFeePerGas: gwei("60") });
  });

  it("leaves a normal suggestion unchanged", () => {
    const s = { maxFeePerGas: gwei("63.2"), maxPriorityFeePerGas: gwei("30") };
    expect(capFees(s, caps)).toEqual(s);
  });

  it("clamps the 500 gwei suggestion seen in past failed anchors", () => {
    expect(capFees({ maxFeePerGas: gwei("500"), maxPriorityFeePerGas: gwei("500") }, caps)).toEqual(caps);
  });

  it("keeps maxFee >= priority", () => {
    const out = capFees({ maxFeePerGas: gwei("20"), maxPriorityFeePerGas: gwei("30") }, caps);
    expect(out.maxFeePerGas).toBe(gwei("30"));
  });

  it("falls back to the caps when the RPC gives no suggestion", () => {
    expect(capFees({ maxFeePerGas: null, maxPriorityFeePerGas: null }, caps)).toEqual(caps);
  });

  it("reads env overrides and rejects priority > max", () => {
    expect(anchorFeeCaps({ ANCHOR_MAX_FEE_GWEI: "50", ANCHOR_MAX_PRIORITY_FEE_GWEI: "30" }).maxFeePerGas).toBe(gwei("50"));
    expect(() => anchorFeeCaps({ ANCHOR_MAX_FEE_GWEI: "20", ANCHOR_MAX_PRIORITY_FEE_GWEI: "30" })).toThrow();
  });
});
