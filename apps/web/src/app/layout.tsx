import type { Viewport } from "next";
import { AuthProvider } from "@/lib/client/auth-context";

// No viewport meta tag existed anywhere in the app before this. Without
// one, some browsers (particularly mobile) render the page against a
// fixed ~980px virtual viewport and let the user pan/zoom around it,
// which shows up as "the page is scrollable sideways" regardless of any
// CSS overflow:hidden rule on the content itself — that's a browser-level
// viewport behavior CSS on the page can't override.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f5" }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
