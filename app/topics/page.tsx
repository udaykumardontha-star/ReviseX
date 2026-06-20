import type { Metadata } from "next";
import { TopicsPageClient } from "./TopicsPageClient";
import { topicService } from "@/services";

export const metadata: Metadata = {
  title: "Topics",
  description: "Browse all SSC exam topics with notes and questions.",
};

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const result = await topicService.listTopics({ page: 1, limit: 24 });
  const initialData = result.success ? result.data : null;
  return <TopicsPageClient initialData={initialData} />;
}
