import type { Metadata } from "next";
import { HomeClient } from "./HomeClient";
import { questionService } from "@/services";

export const metadata: Metadata = {
  title: "Dashboard | NeomX",
  description: "Dashboard and search.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const statsRes = await questionService.getCategoryStats();
  const stats = statsRes.success ? statsRes.data : [];
  return <HomeClient initialStats={stats} />;
}

