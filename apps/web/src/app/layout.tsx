import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/client/auth-context";
import { THEME_CSS } from "@/lib/client/theme";

// No viewport meta tag existed anywhere in the app before this. Without
// one, some browsers (particularly mobile) render the page against a
// fixed ~980px virtual viewport and let the user pan/zoom around it,
// which shows up as "the page is scrollable sideways" regardless of any
// CSS overflow:hidden rule on the content itself — that's a browser-level
// viewport behavior CSS on the page can't override.
export const metadata: Metadata = {
  title: {
    default: "DigiVault — Tamper-evident evidence for case documents",
    template: "%s | DigiVault",
  },
  description:
    "DigiVault fingerprints every page of every case document, anchors it on Polygon, and redacts victim identity before anything is shared.",
  applicationName: "DigiVault",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style>{THEME_CSS}</style>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
