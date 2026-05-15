import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/api-client";
import type { StoreScanInput } from "@/lib/types";

// Server-side handler: calls the API store scan. If the asset was in_service
// (de-racking), writes rack_location: null to facilities to remove the row.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as StoreScanInput & { from_state?: string };
  const client = createApiClient();

  let asset;
  try {
    asset = await client.scans.store(body);
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    return NextResponse.json(
      { error: { code: e.code ?? "unknown_error", message: e.message ?? "Store failed" } },
      { status: e.status ?? 500 },
    );
  }

  const writebacks: string[] = [];

  // Only de-rack from facilities when moving out of in_service
  if (body.from_state === "in_service") {
    try {
      await client.mock.updateFacilities({ tagged_id: body.asset_tag, rack_location: null });
      writebacks.push("facilities");
    } catch {
      // Write-back failure is logged but not fatal
    }
  }

  return NextResponse.json({ asset, writebacks }, { status: 200 });
}
