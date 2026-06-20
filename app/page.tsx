import type { Metadata } from "next";
import { revisionService } from "@/services";
import { DashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard | ReviseX",
  description: "Your SSC exam revision dashboard — streak, stats, and topics needing attention.",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const result = revisionService.getDashboardData();
  const data = result.success ? result.data : null;

  return <DashboardClient data={data} />;
}
