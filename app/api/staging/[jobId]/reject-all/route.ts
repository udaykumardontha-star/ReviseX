import { type NextRequest, NextResponse } from "next/server";
import { stagingService } from "@/services";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

  const result = stagingService.rejectAll(jobId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
