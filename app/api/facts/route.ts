import { NextResponse } from "next/server";
import { revisionService } from "@/services/revision_service";

export async function GET() {
  try {
    const result = await revisionService.getDailyFacts();
    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 500 });
    }
    
    return NextResponse.json(
      { facts: result.data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load facts";
    console.error("[Facts] Failed to load facts:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
