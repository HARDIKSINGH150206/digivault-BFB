import * as pdfjsLib from "pdfjs-dist";

// Copied to public/ by scripts/copy-pdf-worker.mjs (see package.json predev/prebuild).
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
