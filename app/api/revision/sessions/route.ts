import { type NextRequest, NextResponse } from "next/server";
import { revisionService } from "@/services";

/** POST /api/revision/sessions — start a new session */
export async function POST(req: NextRequest) {
  const body = await req.json() as { topicSlug?: string; topicId?: number };

  if (body.topicSlug) {
    const result = revisionService.startSessionBySlug(body.topicSlug);
    if (!result.success) return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    return NextResponse.json(result.data, { status: 201 });
  }

  if (body.topicId) {
    const result = revisionService.startSession(body.topicId);
    if (!result.success) return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    return NextResponse.json(result.data, { status: 201 });
  }

  return NextResponse.json({ error: "topicSlug or topicId required" }, { status: 400 });
}

/** GET /api/revision/sessions — recent sessions */
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);
  const sessions = revisionService.getRecentSessions(limit);
  return NextResponse.json(sessions);
}
