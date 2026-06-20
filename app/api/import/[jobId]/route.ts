import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

  const result = importService.getProgress(jobId);
  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 404 });
  }
  return NextResponse.json(result.data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);
  if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

  const result = importService.deleteJob(jobId);
  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
