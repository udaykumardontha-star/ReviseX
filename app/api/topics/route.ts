import { type NextRequest, NextResponse } from "next/server";
import { topicService } from "@/services";
import type { TopicFilterOptions } from "@/repositories";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "24", 10);
  const category = searchParams.get("category") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const filters: TopicFilterOptions = { limit: pageSize };
  if (category) filters.category = category as NonNullable<TopicFilterOptions["category"]>;
  if (status) filters.status = status as NonNullable<TopicFilterOptions["status"]>;
  if (q) filters.search = q;

  const result = await topicService.listTopics({ ...filters, page });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.data);
}
