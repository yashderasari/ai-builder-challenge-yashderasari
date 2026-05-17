import Link from "next/link";
import { headers } from "next/headers";
import type { ReconcileReport, ReconcileRow } from "@/lib/reconcile";
import { formatDate } from "@/lib/format";
import { UnifiedIssueTable } from "@/components/UnifiedIssueTable";
import type { SystemFlag, UnifiedRow, IssueSystem, IssueSeverity } from "@/components/UnifiedIssueTable";

export default async function ManagerReconcilePage({
  searchParams,
}: {
  searchParams: Promise<{ rs?: string }>;
}) {
  const { rs: severityFilter } = await searchParams;
  let report: ReconcileReport;
  try {
    const host = (await headers()).get("host") ?? "localhost:3000";
    const proto = process.env.VERCEL_URL ? "https" : "http";
    const res = await fetch(`${proto}://${host}/api/reconcile`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    report = (await res.json()) as ReconcileReport;
  } catch {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Reconciliation report</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load the report. Make sure the API is running and try again.
        </div>
      </div>
    );
  }

  const mergeFlag = (a: SystemFlag, b: SystemFlag): SystemFlag =>
    a === "alert" || b === "alert" ? "alert" : a === "ok" || b === "ok" ? "ok" : "none";

  const severityRank: Record<IssueSeverity, number> = { real: 0, ambiguous: 1, unaudited: 2, expected: 3 };

  const unifiedRowMap = new Map<string, UnifiedRow>();

  const addRows = (
    rows: ReconcileRow[],
    severity: IssueSeverity,
    systems: IssueSystem[],
    getFlags: (row: ReconcileRow) => { ops: SystemFlag; facilities: SystemFlag; finance: SystemFlag }
  ) => {
    for (const row of rows) {
      const flags = getFlags(row);
      const existing = unifiedRowMap.get(row.asset_tag);
      if (existing) {
        existing.ops = mergeFlag(existing.ops, flags.ops);
        existing.facilities = mergeFlag(existing.facilities, flags.facilities);
        existing.finance = mergeFlag(existing.finance, flags.finance);
        existing.issues.push({ text: row.detail, severity, systems });
        if (severityRank[severity] < severityRank[existing.severity]) existing.severity = severity;
        if (!existing.timestamps.ops && row.ops?.updated_at) existing.timestamps.ops = row.ops.updated_at;
        if (!existing.timestamps.facilities && row.facilities?.last_observed) existing.timestamps.facilities = row.facilities.last_observed;
        if (!existing.timestamps.finance && row.finance?.capitalized_on) existing.timestamps.finance = row.finance.capitalized_on;
      } else {
        unifiedRowMap.set(row.asset_tag, {
          asset_tag: row.asset_tag,
          model: row.ops?.model ?? "—",
          manufacturer: row.ops?.manufacturer ?? "—",
          ...flags,
          severity,
          issues: [{ text: row.detail, severity, systems }],
          timestamps: {
            ops: row.ops?.updated_at,
            facilities: row.facilities?.last_observed,
            finance: row.finance?.capitalized_on ?? undefined,
          },
          location: row.ops?.location
            ? [row.ops.location.site, row.ops.location.room, row.ops.location.rack, row.ops.location.ru]
                .filter(Boolean).join(" › ")
            : row.facilities?.rack_location ?? undefined,
          custodian: row.ops?.custodian ?? undefined,
        });
      }
    }
  };

  // Real drift
  addRows(report.real_drift.ghost_in_facilities, "real", ["ops", "facilities"],
    row => ({ ops: "none", facilities: "alert", finance: row.finance ? "alert" : "none" }));
  addRows(report.real_drift.ghost_in_finance, "real", ["ops", "finance"],
    row => ({ ops: "none", facilities: row.facilities ? "ok" : "none", finance: "alert" }));
  addRows(report.real_drift.location_mismatch, "real", ["ops", "facilities"],
    row => ({ ops: "alert", facilities: "alert", finance: row.finance ? "ok" : "none" }));

  // Ambiguous
  addRows(report.ambiguous.missing_from_facilities, "ambiguous", ["ops", "facilities"],
    row => ({ ops: "ok", facilities: "none", finance: row.finance ? "ok" : "none" }));
  addRows(report.ambiguous.state_finance_conflict, "ambiguous", ["finance"],
    row => ({ ops: "ok", facilities: row.facilities ? "ok" : "none", finance: "alert" }));
  addRows(report.ambiguous.stale_observation, "ambiguous", ["ops", "facilities"],
    row => ({ ops: "ok", facilities: "alert", finance: row.finance ? "ok" : "none" }));
  addRows(report.ambiguous.facilities_newer_than_ops, "ambiguous", ["ops", "facilities"],
    row => ({ ops: "alert", facilities: "alert", finance: row.finance ? "ok" : "none" }));

  // Unaudited
  addRows(report.unaudited.no_facilities_record, "unaudited", ["facilities"],
    row => ({ ops: "ok", facilities: "none", finance: row.finance ? "ok" : "none" }));
  addRows(report.unaudited.no_finance_record, "unaudited", ["finance"],
    row => ({ ops: "ok", facilities: row.facilities ? "ok" : "none", finance: "none" }));

  // Expected — folded into unaudited (same root cause: Facilities only tracks racked gear)
  addRows(report.expected.not_in_facilities, "unaudited", ["facilities"],
    row => ({ ops: "ok", facilities: "none", finance: row.finance ? "ok" : "none" }));
  addRows(report.expected.not_in_finance, "unaudited", ["finance"],
    row => ({ ops: "ok", facilities: row.facilities ? "ok" : "none", finance: "none" }));

  const allRows = Array.from(unifiedRowMap.values());
  const verifiedClean = report.verified_clean;
  // Non-clean ops assets = total ops - verified clean (excludes ghost assets with no ops record)
  const nonCleanOpsCount = report.totals.ops - verifiedClean;

  const realCount      = allRows.filter(r => r.severity === "real").length;
  const ambiguousCount = allRows.filter(r => r.severity === "ambiguous").length;
  const unauditedCount = allRows.filter(r => r.severity === "unaudited").length;

  return (
    <div className="max-w-7xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/manager" className="hover:text-gray-800">Assets</Link>
        <span>›</span>
        <span className="text-gray-800">Reconciliation</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Reconciliation report</h1>
          <p className="text-gray-500 text-sm">
            {nonCleanOpsCount} assets not confirmed clean — as of {formatDate(report.generated_at)}
          </p>
        </div>
        <Link
          href="/manager/reconcile"
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </Link>
      </div>

      {/* Summary cards — click to filter the table */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {([
          { key: "real",      label: "Action needed",       sub: "Two systems directly conflict",  active: "border-red-400 bg-red-100",      inactive: "border-red-200 bg-red-50",      count: realCount,      textBold: "text-red-800",    textSub: "text-red-500" },
          { key: "ambiguous", label: "Needs review",        sub: "Likely timing or process gaps",  active: "border-yellow-400 bg-yellow-100", inactive: "border-yellow-200 bg-yellow-50", count: ambiguousCount, textBold: "text-yellow-800", textSub: "text-yellow-600" },
          { key: "unaudited", label: "No Facilities record", sub: "Not racked — cannot verify",    active: "border-slate-400 bg-slate-100",   inactive: "border-slate-200 bg-slate-50",  count: unauditedCount, textBold: "text-slate-700",  textSub: "text-slate-500" },
        ] as const).map(({ key, label, sub, active, inactive, count, textBold, textSub }) => {
          const isActive = severityFilter === key;
          return (
            <Link
              key={key}
              href={isActive ? "/manager/reconcile" : `/manager/reconcile?rs=${key}`}
              className={`rounded-lg border px-5 py-4 transition-colors hover:opacity-90 ${isActive ? active : inactive}`}
            >
              <p className={`text-3xl font-bold ${textBold}`}>{count}</p>
              <p className={`text-sm font-semibold mt-1 ${textBold}`}>{label}</p>
              <p className={`text-xs mt-0.5 ${textSub}`}>{isActive ? "Click to clear filter" : sub}</p>
            </Link>
          );
        })}
      </div>

      {/* Unified table — all 310 non-clean assets */}
      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-gray-800">All assets not confirmed clean</h2>
          <p className="text-sm text-gray-500">
            {allRows.length} records — {nonCleanOpsCount} ops assets plus {allRows.length - nonCleanOpsCount} ghost tag{allRows.length - nonCleanOpsCount !== 1 ? "s" : ""} with no Ops record. Sorted by severity. Filter by system to narrow down which team acts.
          </p>
        </div>
        <UnifiedIssueTable rows={allRows} />
      </section>
    </div>
  );
}
