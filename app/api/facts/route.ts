import { NextResponse } from "next/server";
import { revisionService } from "@/services/revision_service";

export async function GET() {
  try {
    const result = await revisionService.getDailyFacts();
    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 500 });
    }
    
    return NextResponse.json({ facts: result.data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
