import type { Metadata } from "next";
import { TopicsPageClient } from "./TopicsPageClient";

export const metadata: Metadata = {
  title: "Topics",
  description: "Browse all SSC exam topics with notes and questions.",
};

export default function TopicsPage() {
  return <TopicsPageClient />;
}
