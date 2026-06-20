import type { Metadata } from "next";
import { TopicDetailClient } from "./TopicDetailClient";
import { topicService, noteService } from "@/services";
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
  const result = await topicService.getTopic(slug);

  if (!result.success && result.code === "NOT_FOUND") {
    notFound();
  }

  const topic = result.success ? result.data : null;

  let initialNote = null;
  if (topic && topic.topicStatus === "generated") {
    const noteResult = await noteService.getNoteByTopicSlug(slug);
    if (noteResult.success) {
      initialNote = {
        note: {
          id: noteResult.data.id,
          content: noteResult.data.content,
          aiModel: noteResult.data.aiModel ?? "Unknown",
          createdAt: noteResult.data.createdAt,
        },
        keywords: noteResult.data.keywordList,
        facts: noteResult.data.factList,
        wasFromCache: true,
      };
    }
  }

  return <TopicDetailClient slug={slug} initialTopic={topic} initialNote={initialNote} />;
}
