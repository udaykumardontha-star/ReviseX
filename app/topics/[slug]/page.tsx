import type { Metadata } from "next";
import { TopicDetailClient } from "./TopicDetailClient";
import { topicService } from "@/services";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    description: `Revision notes and practice questions for ${slug}`,
  };
}

export const dynamic = "force-dynamic";

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = topicService.getTopic(slug);

  if (!result.success && result.code === "NOT_FOUND") {
    notFound();
  }

  const topic = result.success ? result.data : null;
  return <TopicDetailClient slug={slug} initialTopic={topic} />;
}
