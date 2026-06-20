import type { Metadata } from "next";
import { revisionService } from "@/services";
import { RevisionPageClient } from "./RevisionPageClient";

export const metadata: Metadata = {
  title: "Revision Hub",
  description: "Track your study streak, session history, and daily activity.",
};

export const dynamic = "force-dynamic";

export default async function RevisionPage() {
  const result = await revisionService.getDashboardData();
  const data = result.success ? result.data : null;
  return <RevisionPageClient data={data} />;
}
