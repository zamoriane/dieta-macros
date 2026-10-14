import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastHost } from "@/components/ui/Toast";
import { I18nProvider } from "@/lib/i18n/client";
import { getT, serverLocale } from "@/lib/i18n/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: "Taking care of yourself",
    description: t("app.tagline"),
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Taking care", statusBarStyle: "default" },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await serverLocale();
  return (
    <html lang={locale === "en" ? "en" : "pt-PT"} className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider initial={locale}>
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 md:pb-12 md:pt-8">
          {children}
        </main>
        <ToastHost />
        </I18nProvider>
      </body>
    </html>
  );
}
