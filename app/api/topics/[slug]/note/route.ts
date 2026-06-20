import { type NextRequest, NextResponse } from "next/server";
import { noteService } from "@/services";

export const runtime = "nodejs";
export const maxDuration = 120;

/** GET — return cached note if it exists */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await noteService.getNoteByTopicSlug(slug);
  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 404 });
  }
  return NextResponse.json(result.data);
}

/** POST — lazy generate (returns cache or calls Gemini) */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await noteService.generateOrGetNote(slug);

  if (!result.success) {
    const status =
      result.code === "NOT_FOUND" ? 404
      : result.code === "AI_RATE_LIMIT" ? 429
      : 500;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json(result.data);
}
