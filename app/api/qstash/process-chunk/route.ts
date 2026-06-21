import { type NextRequest, NextResponse } from "next/server";
import { importService } from "@/services";
import { qstashClient } from "@/lib/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

export const runtime = "nodejs";
export const maxDuration = 60; // Max allowed on Vercel Hobby

async function handler(req: NextRequest) {
  try {
    const body = await req.json() as { jobId: number };
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    // Pass null for fileBuffer and "application/pdf" because we read textContent from DB
    const result = await importService.processImport(jobId, null, "application/pdf");

    if (!result.success) {
      console.error(`[QStash] Job ${jobId} failed processing chunk:`, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.isCompleted) {
      if (!qstashClient) {
        console.warn(`[QStash] Warning: Job ${jobId} not finished but QSTASH_TOKEN is missing! Process will stop.`);
        return NextResponse.json({ message: "Chunk processed, but no QSTASH_TOKEN to continue" });
      }

      // Automatically queue the next chunk
      const url = new URL("/api/qstash/process-chunk", req.url).toString();
      await qstashClient.publishJSON({
        url,
        body: { jobId },
      });
      console.log(`[QStash] Queued next chunk for Job ${jobId}`);
    } else {
      console.log(`[QStash] Job ${jobId} fully completed.`);
    }

    return NextResponse.json({ success: true, ...result.data });
  } catch (error) {
    console.error("[QStash] Error processing chunk:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Ensure QStash verifies the request originated from them!
export const POST = process.env.QSTASH_TOKEN ? verifySignatureAppRouter(handler) : handler;
