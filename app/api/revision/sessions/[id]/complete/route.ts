import { type NextRequest, NextResponse } from "next/server";
import { revisionService } from "@/services";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });

  const result = revisionService.completeSession(id);
  if (!result.success) return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  return NextResponse.json(result.data);
}
