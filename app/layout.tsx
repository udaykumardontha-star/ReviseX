import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";

export const metadata: Metadata = {
  title: { default: "ReviseX", template: "%s | ReviseX" },
  description: "Your intelligent SSC exam revision companion — import PDFs, review questions, and generate AI-powered notes.",
  keywords: ["SSC", "exam", "revision", "MCQ", "study", "notes"],
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  authors: [{ name: "ReviseX" }],
};

export const viewport: Viewport = {
  themeColor: "#34C759",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <Sidebar />
          <header className="app-topnav">
            <TopNav />
          </header>
          <main className="app-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
