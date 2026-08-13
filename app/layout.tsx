import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jules DeepDive · Async coding agent dashboard",
  description:
    "Jules DeepDive is a mobile-first research workspace for the Google Jules coding agent: investigate repositories, start tasks, approve plans, and follow live progress.",
  applicationName: "Jules DeepDive",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/jules-octopus.jpeg", type: "image/jpeg" },
    ],
    shortcut: [{ url: "/favicon-32x32.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Enables env(safe-area-inset-*) on notched devices.
  viewportFit: "cover",
  themeColor: "#1c1c1c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-background">
      <body className={`${inter.variable} min-h-dvh bg-background font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
