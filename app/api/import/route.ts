import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";
import { SUPPORTED_MIME_TYPES } from "@/lib/pdf/pdf_processor";

export const runtime = "nodejs";
export const maxDuration = 30;

const ACCEPTED_TYPES = new Set([...SUPPORTED_MIME_TYPES, "text/plain"]);

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // ── TEXT import (JSON body with textContent field) ──────────────────
    if (contentType.includes("application/json")) {
      const body = await req.json() as { textContent?: string; sourceName?: string; fileName?: string; forcedCategory?: string };
      const textContent = body.textContent?.trim();

      if (!textContent) {
        return NextResponse.json({ error: "textContent is required" }, { status: 400 });
      }

      const result = await importService.startImport({
        textContent,
        fileName: body.fileName ?? "Pasted Text",
        sourceName: body.sourceName ?? "Manual Paste",
        ...(body.forcedCategory && { forcedCategory: body.forcedCategory }),
      });

      if (!result.success) {
        const statusCode = result.code === "DUPLICATE" ? 409 : 400;
        return NextResponse.json({ error: result.error, code: result.code, data: result.cause }, { status: statusCode });
      }

      return NextResponse.json(result.data, { status: 201 });
    }

    // ── FILE import (multipart/form-data — PDF or Image) ────────────────
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceName = (formData.get("source") as string) || "Unknown Source";
    const forcedCategory = (formData.get("forcedCategory") as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Normalise MIME type (browser may send "image/jpg" → we treat as "image/jpeg")
    const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;

    if (!ACCEPTED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Accepted: PDF, PNG, JPG, JPEG, WEBP` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importService.startImport({
      fileBuffer: buffer,
      mimeType,
      fileName: file.name,
      sourceName,
      ...(forcedCategory && { forcedCategory }),
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
  const jobs = await importService.listJobs();
  const stats = await importService.getJobStats();
  return NextResponse.json({ jobs, stats });
}
