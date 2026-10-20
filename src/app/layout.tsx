import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AccountMenu } from "@/components/platform/AccountMenu";
import { AppHeader, AppHeaderFallback } from "@/components/shell/AppHeader";
import { EventProvider } from "@/components/shell/EventContext";
import { Footer } from "@/components/shell/Footer";
import { SITE_NAME } from "@/config/site";
import { validateAllConfig } from "@/config/validate";
import "./globals.css";

// Fonts load in the browser from Google Fonts. next/font/google started failing Turbopack builds
// ("next/font/google queries have exactly one entry"), so the build no longer downloads fonts.
// Archivo's width axis (62–125) gives the 125% display type.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&family=Martian+Mono:wght@400;500;600&display=swap";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Build AI applications with internet-native payments. Explore, configure and start building. No sign-up, no crypto knowledge needed.",
};

export const viewport: Viewport = { themeColor: "#161616" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  validateAllConfig();
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <EventProvider>
          <div className="canvas-dots flex min-h-screen flex-col">
            <Suspense fallback={<AppHeaderFallback />}>
              <AppHeader account={<Suspense fallback={null}><AccountMenu /></Suspense>} />
            </Suspense>
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </EventProvider>
      </body>
    </html>
  );
}
