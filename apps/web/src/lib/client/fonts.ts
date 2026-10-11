import { Inter, JetBrains_Mono } from "next/font/google";

// Self-hosted via next/font (built at compile time, no runtime request to
// Google's servers) — shared across every page so the brand typography
// (and the generated font files) stay identical instead of each page
// pulling its own copy. Inter for headings and UI text (headings use tight
// tracking rather than a separate display face), JetBrains Mono for hashes,
// tx ids and code.
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

/** className for a page root: font variables plus Inter as the default face. */
export const fontClass = `${inter.variable} ${mono.variable} ${inter.className}`;
