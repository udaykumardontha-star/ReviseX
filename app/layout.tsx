import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: { default: "NeomX", template: "%s | NeomX" },
  description: "Your intelligent SSC exam revision companion — import PDFs, screenshots & text, review questions, and generate AI-powered notes.",
  keywords: ["SSC", "exam", "revision", "MCQ", "study", "notes", "AI"],
  manifest: "/manifest.json",
  authors: [{ name: "NeomX" }],
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NeomX" },
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
        <ServiceWorkerRegistrar />
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

