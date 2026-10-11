import { Inter } from "next/font/google";
import localFont from "next/font/local";

// Self-hosted via next/font (built at compile time, no runtime request to
// Google's servers) — shared across every page so the brand typography
// (and the generated font files) stay identical instead of each page
// pulling its own copy. Inter for headings and UI text (headings use
// weight 500 with tight tracking rather than a separate display face),
// Geist Mono for hashes, tx ids and code. Geist Mono is not in Next
// 14.2's Google font list, so its latin variable woff2 (SIL OFL) is
// checked in under src/fonts.
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
export const mono = localFont({
  src: "../../fonts/GeistMono-latin.woff2",
  weight: "400 600",
  variable: "--font-mono",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

/** className for a page root: font variables plus Inter as the default face. */
export const fontClass = `${inter.variable} ${mono.variable} ${inter.className}`;
