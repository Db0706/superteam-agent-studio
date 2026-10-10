import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import { AppHeader } from "@/components/shell/AppHeader";
import { EventProvider } from "@/components/shell/EventContext";
import { Footer } from "@/components/shell/Footer";
import { SITE_NAME } from "@/config/site";
import { validateAllConfig } from "@/config/validate";
import "./globals.css";

// Archivo is used at width 125% for display type, so load the wdth axis.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const martian = Martian_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-martian", display: "swap" });

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Build AI applications with internet-native payments. Explore, configure and start building. No sign-up, no crypto knowledge needed.",
};

export const viewport: Viewport = { themeColor: "#161616" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  validateAllConfig();
  return (
    <html lang="en-GB" className={`${archivo.variable} ${martian.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:p-2">
          Skip to content
        </a>
        <EventProvider>
          <div className="canvas-dots flex min-h-screen flex-col">
            <AppHeader />
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
