import Link from "next/link";
import { headers } from "next/headers";
import type { ReconcileReport, ReconcileRow } from "@/lib/reconcile";
import { formatDate } from "@/lib/format";
import { UnifiedIssueTable } from "@/components/UnifiedIssueTable";
import type { SystemFlag, UnifiedRow, IssueSystem } from "@/components/UnifiedIssueTable";
import { ExpectedGapsTable } from "@/components/ExpectedGapsTable";

type ExtraColumn = {
  header: string;
  render: (row: ReconcileRow) => React.ReactNode;
};

type BucketProps = {
  title: string;
  managerNote: string;
  rows: ReconcileRow[];
  action?: string;
  variant: "expected" | "real" | "ambiguous";
  extra?: ExtraColumn;
};

function Bucket({ title, managerNote, rows, action, variant, extra }: BucketProps) {
  if (rows.length === 0) return null;

  const colors = {
    expected: "border-gray-200 bg-gray-50",
    real: "border-red-200 bg-red-50",
    ambiguous: "border-yellow-200 bg-yellow-50",
  };
  const countColors = {
    expected: "bg-gray-200 text-gray-700",
    real: "bg-red-200 text-red-800",
    ambiguous: "bg-yellow-200 text-yellow-800",
  };

  return (
    <div className={`rounded-lg border p-5 space-y-3 ${colors[variant]}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${countColors[variant]}`}>
            {rows.length}
          </span>
        </div>
        <p className="text-sm text-gray-600">{managerNote}</p>
        {action && <p className="text-sm font-medium text-gray-700">→ {action}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 font-medium text-gray-500">Tag</th>
              <th className="text-left py-2 pr-4 font-medium text-gray-500 hidden sm:table-cell">Asset</th>
              <th className="text-left py-2 pr-4 font-medium text-gray-500">What's wrong</th>
              {extra && <th className="text-left py-2 font-medium text-gray-500 hidden md:table-cell">{extra.header}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.asset_tag} className="hover:bg-white/50">
                <td className="py-2 pr-4">
                  <Link href={`/manager/assets/${row.asset_tag}`} className="font-mono text-blue-600 hover:underline">
                    {row.asset_tag}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-gray-600 hidden sm:table-cell">
                  {row.ops ? `${row.ops.manufacturer} ${row.ops.model}` : "—"}
                </td>
                <td className="py-2 pr-4 text-gray-500">{row.detail}</td>
                {extra && <td className="py-2 text-gray-400 hidden md:table-cell">{extra.render(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ManagerReconcilePage() {
  let report: ReconcileReport;
  try {
    // Fetch from the route handler so the join lives in one place (app/api/reconcile/route.ts).
    // Derive the origin from the incoming request host so any port works locally,
    // and VERCEL_URL covers production deploys.
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

  const expectedCount =
    report.expected.not_in_facilities.length +
    report.expected.not_in_finance.length;

  // Build deduplicated unified rows for the issues table
  const mergeFlag = (a: SystemFlag, b: SystemFlag): SystemFlag =>
    a === "alert" || b === "alert" ? "alert" : a === "ok" || b === "ok" ? "ok" : "none";

  const unifiedRowMap = new Map<string, UnifiedRow>();

  const addRows = (
    rows: ReconcileRow[],
    severity: "real" | "ambiguous",
    systems: IssueSystem[] | ((row: ReconcileRow) => IssueSystem[]),
    getFlags: (row: ReconcileRow) => { ops: SystemFlag; facilities: SystemFlag; finance: SystemFlag }
  ) => {
    const getSystems = typeof systems === "function" ? systems : () => systems;
    for (const row of rows) {
      const flags = getFlags(row);
      const rowSystems = getSystems(row);
      const existing = unifiedRowMap.get(row.asset_tag);
      if (existing) {
        existing.ops = mergeFlag(existing.ops, flags.ops);
        existing.facilities = mergeFlag(existing.facilities, flags.facilities);
        existing.finance = mergeFlag(existing.finance, flags.finance);
        existing.issues.push({ text: row.detail, severity, systems: rowSystems });
        if (severity === "real") existing.severity = "real";
        // Fill in any timestamps not yet set
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
          issues: [{ text: row.detail, severity, systems: rowSystems }],
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

  // ghost_in_facilities: facilities has a record ops doesn't know about — both teams need to investigate
  addRows(report.real_drift.ghost_in_facilities, "real", ["ops", "facilities"],
    row => ({ ops: "none", facilities: "alert", finance: row.finance ? "ok" : "none" }));
  // ghost_in_finance: finance has a record ops doesn't know about — both teams need to investigate
  addRows(report.real_drift.ghost_in_finance, "real", ["ops", "finance"],
    row => ({ ops: "none", facilities: row.facilities ? "ok" : "none", finance: "alert" }));
  // location_mismatch: both ops and facilities have conflicting data — show under both filters
  addRows(report.real_drift.location_mismatch, "real", ["ops", "facilities"],
    row => ({ ops: "alert", facilities: "alert", finance: row.finance ? "ok" : "none" }));
  // missing_from_facilities: ops says in_service but no facilities record — both need to verify
  addRows(report.ambiguous.missing_from_facilities, "ambiguous", ["ops", "facilities"],
    row => ({ ops: "ok", facilities: "none", finance: row.finance ? "ok" : "none" }));
  // state_finance_conflict: ops correctly marked asset disposed/rma — finance just hasn't caught up
  addRows(report.ambiguous.state_finance_conflict, "ambiguous", ["finance"],
    row => ({ ops: "ok", facilities: row.facilities ? "ok" : "none", finance: "alert" }));
  // stale_observation: facilities record is outdated while ops shows active — both teams need to verify
  addRows(report.ambiguous.stale_observation, "ambiguous", ["ops", "facilities"],
    row => ({ ops: "ok", facilities: "alert", finance: row.finance ? "ok" : "none" }));

  const unifiedRows = Array.from(unifiedRowMap.values())
    .sort((a, b) => a.severity === b.severity ? 0 : a.severity === "real" ? -1 : 1);

  const realDriftCount = unifiedRows.filter(r => r.issues.some(i => i.severity === "real")).length;
  const ambiguousCount = unifiedRows.filter(r => r.issues.some(i => i.severity === "ambiguous")).length;

  return (
    <div className="max-w-7xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/manager" className="hover:text-gray-800">Assets</Link>
        <span>›</span>
        <span className="text-gray-800">Reconciliation</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Three-way reconciliation</h1>
          <p className="text-gray-500 text-sm">
            Operations · Facilities · Finance — as of {formatDate(report.generated_at)}
          </p>
        </div>
        <Link
          href="/manager/reconcile"
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Refresh
        </Link>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4">
        {realDriftCount > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-5 flex items-center gap-4">
            <p className="text-4xl font-bold text-red-800">{realDriftCount}</p>
            <div>
              <p className="font-semibold text-red-800">Need action</p>
              <p className="text-xs text-red-500 mt-0.5">Two systems genuinely disagree. Someone needs to physically verify or contact finance — these won't resolve on their own.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-green-200 bg-green-50 px-6 py-5 flex items-center gap-4">
            <p className="text-4xl font-bold text-green-800">0</p>
            <div>
              <p className="font-semibold text-green-800">Need action</p>
              <p className="text-xs text-green-600 mt-0.5">No real drift found — all systems agree on assets currently in service.</p>
            </div>
          </div>
        )}
        {ambiguousCount > 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-6 py-5 flex items-center gap-4">
            <p className="text-4xl font-bold text-yellow-800">{ambiguousCount}</p>
            <div>
              <p className="font-semibold text-yellow-800">Need review</p>
              <p className="text-xs text-yellow-600 mt-0.5">Likely explained by timing or process gaps. Look at each one and decide: missing scan, stale record, or no action needed.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white px-6 py-5 flex items-center gap-4">
            <p className="text-4xl font-bold text-gray-300">0</p>
            <div>
              <p className="font-semibold text-gray-400">Need review</p>
              <p className="text-xs text-gray-400 mt-0.5">Nothing ambiguous</p>
            </div>
          </div>
        )}
      </div>

      {/* System totals */}
      <div className="flex items-center gap-6 text-sm text-gray-400 px-1">
        <span><span className="font-medium text-gray-600">{report.totals.ops.toLocaleString()}</span> ops assets</span>
        <span className="text-gray-200">·</span>
        <span><span className="font-medium text-gray-600">{report.totals.facilities.toLocaleString()}</span> facilities records</span>
        <span className="text-gray-200">·</span>
        <span><span className="font-medium text-gray-600">{report.totals.finance.toLocaleString()}</span> finance records</span>
      </div>

      {/* Clean bill of health */}
      {realDriftCount === 0 && ambiguousCount === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          <strong>No drift found.</strong> All three systems agree on every asset currently in service. Expected scope differences ({expectedCount}) are noted below.
        </div>
      )}

      {/* Issues table — real drift + ambiguous, deduplicated by asset */}
      {unifiedRows.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-gray-800">Assets with issues</h2>
            <p className="text-sm text-gray-500">
              {unifiedRows.length} unique asset{unifiedRows.length !== 1 ? "s" : ""} with issues —{" "}
              {realDriftCount} need action, {ambiguousCount} need review
              {realDriftCount + ambiguousCount > unifiedRows.length ? " (some assets have both)" : ""}.
              Filter by system to narrow down which team needs to act.
            </p>
          </div>
          <UnifiedIssueTable rows={unifiedRows} />
        </section>
      )}

      {/* Expected gaps */}
      {expectedCount > 0 && (
        <ExpectedGapsTable
          notInFacilities={report.expected.not_in_facilities}
          notInFinance={report.expected.not_in_finance}
        />
      )}
    </div>
  );
}
