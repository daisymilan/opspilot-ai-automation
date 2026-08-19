import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// NEXT_PUBLIC_APP_URL is the deployed app's own URL (Vercel production
// domain, or localhost in dev) — used only to build absolute metadata/OG
// URLs, never for anything security-sensitive (auth redirects are computed
// server-side, not from this value).
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const description =
  "AI-powered business operations automation: real Claude-generated lead scoring, " +
  "human-in-the-loop approval, and full execution/audit observability — built on " +
  "Next.js, Supabase (Postgres + RLS), and n8n.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "OpsPilot — AI Business Operations Automation",
    template: "%s · OpsPilot",
  },
  description,
  openGraph: {
    title: "OpsPilot — AI Business Operations Automation",
    description,
    url: appUrl,
    siteName: "OpsPilot",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpsPilot — AI Business Operations Automation",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
