import { NextResponse } from "next/server";
import { searchIndexService } from "@/services";

export async function POST() {
  const result = await searchIndexService.rebuildAll();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, results: result.data });
}
