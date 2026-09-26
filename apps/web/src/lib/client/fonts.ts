import { Inter, Manrope } from "next/font/google";

// Self-hosted via next/font (built at compile time, no runtime request to
// Google's servers) — shared across every page so the brand typography
// (and the generated font files) stay identical instead of each page
// pulling its own copy. Manrope for the wordmark/headings, Inter for
// body/UI text.
export const manrope = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
