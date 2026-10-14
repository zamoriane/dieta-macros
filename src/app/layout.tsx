import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ToastHost } from "@/components/ui/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Taking care of yourself",
  description: "Calorias, macros, exercícios e défice do dia, com dados do Oura e Apple.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Taking care", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 md:pb-12 md:pt-8">
          {children}
        </main>
        <ToastHost />
      </body>
    </html>
  );
}
