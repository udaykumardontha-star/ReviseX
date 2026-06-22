import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";

export const runtime = "nodejs";
export const maxDuration = 60; // Max allowed on Vercel Hobby

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
    const contentType = req.headers.get("content-type") ?? "";
    let result;

    if (contentType.includes("application/json")) {
      const bodyText = await req.text();
      const body = bodyText
        ? JSON.parse(bodyText) as { textContent?: string; mimeType?: string }
        : {};
      const textContent = body.textContent?.trim();

      result = await importService.processImport(
        jobId,
        null,
        body.mimeType ?? "text/plain",
        textContent
      );
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "File required for processing" }, { status: 400 });
      }

      const mimeType = file.type === "image/jpg" ? "image/jpeg" : file.type;
      const buffer = Buffer.from(await file.arrayBuffer());

      result = await importService.processImport(
        jobId,
        buffer,
        mimeType
      );
    }

    if (!result.success) {
      const statusCode = result.code === "AI_RATE_LIMIT" ? 429 : 500;
      return NextResponse.json({ error: result.error, code: result.code }, { status: statusCode });
    }

    // If QStash is enabled and not completed, hand off the rest of the chunks to the background queue
    if (!result.data.isCompleted && process.env.QSTASH_TOKEN) {
      const { qstashClient } = await import("@/lib/qstash");
      if (qstashClient) {
        try {
          const url = new URL("/api/qstash/process-chunk", req.url).toString();
          await qstashClient.publishJSON({ url, body: { jobId } });
          console.log(`[QStash] Handoff successful for job ${jobId}. Returning to client.`);
          return NextResponse.json({ ...result.data, isCompleted: true, background: true });
        } catch (error) {
          console.error(`[QStash] Handoff failed for job ${jobId}; continuing in browser:`, error);
        }
      }
    }

    return NextResponse.json(result.data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Processing failed" },
      { status: 500 }
    );
  }
}
