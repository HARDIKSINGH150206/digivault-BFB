// Copies pdfjs-dist's worker file into public/ so the browser can load it
// from a plain, bundler-independent URL (`/pdf.worker.min.mjs`) — avoids
// webpack asset-URL quirks entirely. Runs before `next dev`/`next build`.
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const dest = path.join(__dirname, "..", "public", "pdf.worker.min.mjs");

copyFileSync(workerSrc, dest);
console.log(`[copy-pdf-worker] copied ${workerSrc} -> ${dest}`);
