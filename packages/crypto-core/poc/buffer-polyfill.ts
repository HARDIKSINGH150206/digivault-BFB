import { Buffer } from "buffer";

// merkletreejs expects a Node-style Buffer global; polyfill it for the
// browser. Must be imported before merkletreejs (or anything that imports
// merkletreejs) anywhere in the module graph.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
