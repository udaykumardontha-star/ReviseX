import { type NextRequest, NextResponse } from "next/server";
import { stagingService } from "@/services";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const action = req.nextUrl.pathname.includes("/approve") ? "approve" : "reject";

  if (action === "approve") {
    const result = stagingService.approveQuestion(id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result.data);
  } else {
    const body = await req.json().catch(() => ({})) as { note?: string };
    const result = stagingService.rejectQuestion(id, body.note);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
    return NextResponse.json(result.data);
  }
}
