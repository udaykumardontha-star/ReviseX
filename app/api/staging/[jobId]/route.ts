import { type NextRequest, NextResponse } from "next/server";
import { stagingService } from "@/services";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "20", 10);
  const statusParam = req.nextUrl.searchParams.get("status") as "pending" | "approved" | "rejected" | null;

  const result = await stagingService.getReviewQueue(
    jobId,
    page,
    pageSize,
    statusParam ?? undefined
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
