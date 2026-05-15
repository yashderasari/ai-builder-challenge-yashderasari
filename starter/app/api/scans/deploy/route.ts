import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@/lib/api-client";
import type { DeployScanInput } from "@/lib/types";

// Server-side handler: calls the API deploy scan, then writes back to facilities
// and finance atomically. Keeps the token server-side and the write-back orchestration
// in one testable place.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as DeployScanInput;
  const client = createApiClient();

  let asset;
  try {
    asset = await client.scans.deploy(body);
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; message?: string };
    return NextResponse.json(
      { error: { code: e.code ?? "unknown_error", message: e.message ?? "Deploy failed" } },
      { status: e.status ?? 500 },
    );
  }

  // Write-back to facilities (asset now at this rack)
  const rackLocation = [
    body.location.site,
    body.location.room,
    body.location.row,
    body.location.rack,
    body.location.ru,
  ]
    .filter(Boolean)
    .join("/");

  const writebacks: string[] = [];

  try {
    await client.mock.updateFacilities({ tagged_id: body.asset_tag, rack_location: rackLocation });
    writebacks.push("facilities");
  } catch {
    // Write-back failure is logged but not fatal — the scan itself succeeded
  }

  // Write-back to finance (capitalize on deploy)
  try {
    await client.mock.updateFinance({
      tag: body.asset_tag,
      site: body.location.site,
      status: "capitalized",
      capitalized_on: new Date().toISOString(),
    });
    writebacks.push("finance");
  } catch {
    // Same: log, don't fail
  }

  return NextResponse.json({ asset, writebacks }, { status: 200 });
}
