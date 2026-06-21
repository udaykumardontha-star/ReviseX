import { type NextRequest, NextResponse } from "next/server";
import { questionService } from "@/services";
import type { QuestionFilterOptions } from "@/repositories";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const q = searchParams.get("q");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const category = searchParams.get("category") ?? undefined;
  const subject = searchParams.get("subject") ?? undefined;
  const difficulty = searchParams.get("difficulty") ?? undefined;
  const topicId = searchParams.get("topicId") ? parseInt(searchParams.get("topicId")!, 10) : undefined;
  const isBookmarked = searchParams.get("bookmarked") === "true" ? true : undefined;

  // FTS search if query provided
  if (q && q.trim().length >= 2) {
    const offset = (page - 1) * pageSize;
    const result = await questionService.searchQuestions(q, pageSize, offset);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ...result.data, page, pageSize });
  }

  // Filtered list
  const filters: QuestionFilterOptions = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
  if (category) filters.category = category as NonNullable<QuestionFilterOptions["category"]>;
  if (subject) filters.subject = subject as NonNullable<QuestionFilterOptions["subject"]>;
  if (difficulty) filters.difficulty = difficulty as NonNullable<QuestionFilterOptions["difficulty"]>;
  if (topicId) filters.topicId = topicId;
  if (isBookmarked !== undefined) filters.isBookmarked = isBookmarked;

  const result = await questionService.listQuestions({ ...filters, page });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.data);
}
