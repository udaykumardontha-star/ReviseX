import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — Gemini calls can take time

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId: jobIdStr } = await params;
  const jobId = parseInt(jobIdStr, 10);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "PDF file required for processing" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importService.processImport(jobId, buffer);

    if (!result.success) {
      const statusCode = result.code === "AI_RATE_LIMIT" ? 429 : 500;
      return NextResponse.json({ error: result.error, code: result.code }, { status: statusCode });
    }

    return NextResponse.json(result.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Processing failed" },
      { status: 500 }
    );
  }
}
