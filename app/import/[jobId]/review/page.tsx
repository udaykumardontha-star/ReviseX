import type { Metadata } from "next";
import { ReviewPageClient } from "./ReviewPageClient";

export const metadata: Metadata = { title: "Review Questions" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <ReviewPageClient jobId={parseInt(jobId, 10)} />;
}
