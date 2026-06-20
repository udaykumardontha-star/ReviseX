import type { Metadata } from "next";
import { ImportPageClient } from "./ImportPageClient";

export const metadata: Metadata = {
  title: "Import PDFs",
  description: "Upload SSC exam PDFs to extract and stage MCQ questions.",
};

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return <ImportPageClient />;
}
