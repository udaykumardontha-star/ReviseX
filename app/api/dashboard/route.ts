import { NextResponse } from "next/server";
import { revisionService } from "@/services";

export async function GET() {
  const result = revisionService.getDashboardData();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.data);
}
