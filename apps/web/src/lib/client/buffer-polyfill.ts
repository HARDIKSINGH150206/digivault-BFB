import { Buffer } from "buffer";

// @digivault/crypto-core's Merkle construction (merkletreejs) expects a
// Node-style Buffer global. Browsers don't have one — polyfill it. Must be
// imported FIRST, before anything that imports @digivault/crypto-core,
// same requirement as packages/crypto-core/poc/harness.ts.
if (typeof window !== "undefined" && !(window as unknown as { Buffer?: unknown }).Buffer) {
  (window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
