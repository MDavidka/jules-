import type { Metadata, Viewport } from "next";

import { Providers } from "@/app/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jules+ · Async coding agent dashboard",
  description:
    "A mobile-first dashboard for the Google Jules coding agent: start tasks, approve plans, and follow live progress across your repositories.",
  applicationName: "Jules+",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Enables env(safe-area-inset-*) on notched devices.
  viewportFit: "cover",
  themeColor: "#1c1c1c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-background font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
