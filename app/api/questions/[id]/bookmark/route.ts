import { type NextRequest, NextResponse } from "next/server";
import { questionService } from "@/services";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const result = await questionService.toggleBookmark(id);
  if (!result.success) return NextResponse.json({ error: result.error, code: result.code }, { status: 404 });
  return NextResponse.json(result.data);
}
