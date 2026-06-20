import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";

export const runtime = "nodejs";
export const maxDuration = 30; // 30s timeout for initial parse

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceName = (formData.get("source") as string) || "Unknown Source";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importService.startImport({
      fileBuffer: buffer,
      fileName: file.name,
      sourceName,
    });

    if (!result.success) {
      const statusCode = result.code === "DUPLICATE" ? 409 : 400;
      return NextResponse.json({ error: result.error, code: result.code, data: result.cause }, { status: statusCode });
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const jobs = importService.listJobs();
  const stats = importService.getJobStats();
  return NextResponse.json({ jobs, stats });
}
