import { NextResponse } from "next/server";
import { importService } from "@/services/import_service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);
    if (isNaN(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

    const pauseResult = await importService.pauseJob(jobId);
    if (!pauseResult.success) {
      // If it's not processing, it might already be paused/failed, so we can ignore pause failure
    }
    const result = await importService.deleteJob(jobId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
