import { type NextRequest, NextResponse } from "next/server";
import { searchIndexService } from "@/services";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "8", 10);

  const result = searchIndexService.search(q, limit);
  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }
  return NextResponse.json(result.data);
}
