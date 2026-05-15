import { NextResponse } from "next/server";
import { buildReconcileReport } from "@/lib/reconcile";

export async function GET(): Promise<NextResponse> {
  const report = await buildReconcileReport();
  return NextResponse.json(report);
}
