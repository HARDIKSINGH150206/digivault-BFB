import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { parseUnits } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anchorFeeCaps, capFees, isTransportError, rpcUrlsFromEnv, withRpcFallback } from "./polygon";

const gwei = (n: string) => parseUnits(n, "gwei");

describe("anchor fee caps", () => {
  const caps = anchorFeeCaps({});

  it("defaults to 100 / 30 gwei", () => {
    expect(caps).toEqual({ maxFeePerGas: gwei("100"), maxPriorityFeePerGas: gwei("30") });
  });

  it("leaves a suggestion below the caps unchanged", () => {
    const s = { maxFeePerGas: gwei("63.2"), maxPriorityFeePerGas: gwei("27") };
    expect(capFees(s, caps)).toEqual(s);
  });

  it("clamps a typical 63 gwei priority suggestion to 30", () => {
    expect(capFees({ maxFeePerGas: gwei("63.2"), maxPriorityFeePerGas: gwei("63.2") }, caps)).toEqual({
      maxFeePerGas: gwei("63.2"),
      maxPriorityFeePerGas: gwei("30"),
    });
  });

  it("clamps the 500 gwei suggestion seen in past failed anchors", () => {
    expect(capFees({ maxFeePerGas: gwei("500"), maxPriorityFeePerGas: gwei("500") }, caps)).toEqual(caps);
  });

  it("keeps maxFee >= priority", () => {
    const out = capFees({ maxFeePerGas: gwei("20"), maxPriorityFeePerGas: gwei("28") }, caps);
    expect(out.maxFeePerGas).toBe(gwei("28"));
  });

  it("falls back to the caps when the RPC gives no suggestion", () => {
    expect(capFees({ maxFeePerGas: null, maxPriorityFeePerGas: null }, caps)).toEqual(caps);
  });

  it("reads env overrides and rejects priority > max", () => {
    expect(anchorFeeCaps({ ANCHOR_MAX_FEE_GWEI: "50", ANCHOR_MAX_PRIORITY_FEE_GWEI: "30" }).maxFeePerGas).toBe(gwei("50"));
    expect(() => anchorFeeCaps({ ANCHOR_MAX_FEE_GWEI: "20", ANCHOR_MAX_PRIORITY_FEE_GWEI: "30" })).toThrow();
  });
});

describe("RPC URL list", () => {
  it("puts AMOY_RPC_URL first and the public Amoy RPC as default fallback", () => {
    expect(rpcUrlsFromEnv({ AMOY_RPC_URL: "https://polygon-amoy.drpc.org" })).toEqual([
      "https://polygon-amoy.drpc.org",
      "https://rpc-amoy.polygon.technology",
    ]);
  });

  it("de-duplicates and honours an explicit fallback list (empty = none)", () => {
    expect(rpcUrlsFromEnv({ AMOY_RPC_URL: "https://rpc-amoy.polygon.technology" })).toEqual([
      "https://rpc-amoy.polygon.technology",
    ]);
    expect(rpcUrlsFromEnv({ AMOY_RPC_URL: "https://a", AMOY_RPC_FALLBACK_URLS: "" })).toEqual(["https://a"]);
    expect(rpcUrlsFromEnv({ AMOY_RPC_URL: "https://a", AMOY_RPC_FALLBACK_URLS: "https://b, https://c" })).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
  });
});

describe("isTransportError", () => {
  it("classifies transport vs chain-level errors", () => {
    expect(isTransportError({ code: "SERVER_ERROR" })).toBe(true);
    expect(isTransportError({ message: "getaddrinfo ENOTFOUND rpc-amoy.polygon.technology" })).toBe(true);
    expect(isTransportError({ code: "INSUFFICIENT_FUNDS", message: "insufficient funds" })).toBe(false);
    expect(isTransportError({ code: "CALL_EXCEPTION", message: "execution reverted" })).toBe(false);
  });
});

// A minimal JSON-RPC endpoint: answers eth_chainId with `chainId` and
// eth_blockNumber with 0x2a.
function fakeRpc(chainId: number): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { id, method } = JSON.parse(body);
        const result = method === "eth_chainId" ? `0x${chainId.toString(16)}` : "0x2a";
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}

describe("withRpcFallback", () => {
  let amoy: { server: Server; url: string };
  let wrongChain: { server: Server; url: string };
  const DEAD = "http://127.0.0.1:1"; // nothing listens on port 1

  beforeAll(async () => {
    amoy = await fakeRpc(80002);
    wrongChain = await fakeRpc(1);
  });
  afterAll(() => {
    amoy.server.close();
    wrongChain.server.close();
  });

  it("fails over from a dead endpoint to the next one", async () => {
    const block = await withRpcFallback([DEAD, amoy.url], 80002, (p) => p.getBlockNumber());
    expect(block).toBe(42);
  });

  it("skips an endpoint on the wrong chain", async () => {
    const block = await withRpcFallback([wrongChain.url, amoy.url], 80002, (p) => p.getBlockNumber());
    expect(block).toBe(42);
  });

  it("does not fail over once canRetry() is false (tx already sent)", async () => {
    await expect(withRpcFallback([DEAD, amoy.url], 80002, (p) => p.getBlockNumber(), () => false)).rejects.toThrow();
  });

  it("does not fail over on a chain-level error", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw Object.assign(new Error("execution reverted"), { code: "CALL_EXCEPTION" });
    };
    await expect(withRpcFallback([amoy.url, amoy.url + "/"], 80002, fn)).rejects.toThrow("execution reverted");
    expect(calls).toBe(1);
  });
});
