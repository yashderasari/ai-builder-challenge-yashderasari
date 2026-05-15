import Link from "next/link";
import { buildReconcileReport } from "@/lib/reconcile";
import type { ReconcileRow } from "@/lib/reconcile";
import { formatDate } from "@/lib/format";

const STALE_DAYS = 90;

type BucketProps = {
  title: string;
  managerNote: string;
  rows: ReconcileRow[];
  action?: string;
  variant: "expected" | "real" | "ambiguous";
};

function Bucket({ title, managerNote, rows, action, variant }: BucketProps) {
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
      <div className="flex items-start justify-between gap-3">
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 pr-4 font-medium text-gray-500">Tag</th>
              <th className="text-left py-2 pr-4 font-medium text-gray-500 hidden sm:table-cell">Asset</th>
              <th className="text-left py-2 font-medium text-gray-500">Detail</th>
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
                <td className="py-2 text-gray-500">{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ManagerReconcilePage() {
  let report: Awaited<ReturnType<typeof buildReconcileReport>>;
  try {
    report = await buildReconcileReport();
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

  const realDriftCount =
    report.real_drift.location_mismatch.length +
    report.real_drift.ghost_in_facilities.length +
    report.real_drift.ghost_in_finance.length;

  const ambiguousCount =
    report.ambiguous.state_finance_conflict.length +
    report.ambiguous.missing_from_facilities.length +
    report.ambiguous.stale_observation.length;

  const expectedCount =
    report.expected.not_in_facilities.length +
    report.expected.not_in_finance.length;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/manager" className="hover:text-gray-800">Assets</Link>
        <span>›</span>
        <span className="text-gray-800">Reconciliation</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Three-way reconciliation</h1>
        <p className="text-gray-500 text-sm">
          Operations · Facilities · Finance — as of {formatDate(report.generated_at)}
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{report.totals.ops.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Ops assets</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{report.totals.facilities.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Facilities records</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-2xl font-bold text-gray-900">{report.totals.finance.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Finance records</p>
        </div>
      </div>

      {/* Clean bill of health */}
      {realDriftCount === 0 && ambiguousCount === 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
          <strong>No drift found.</strong> All three systems agree on every asset currently in service. Expected scope differences ({expectedCount}) are noted below.
        </div>
      )}

      {/* Category headers */}
      {realDriftCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-red-700">Real drift — action needed</h2>
            <p className="text-sm text-gray-500">These are genuine disagreements between systems. Someone needs to investigate.</p>
          </div>
          <Bucket
            variant="real"
            title="Unknown tags in facilities"
            managerNote="Facilities has a record for an asset ops doesn't know about. Usually means something was disposed or replaced without scanning."
            action="Send a tech to verify the rack position, then run a receive or dispose scan to reconcile."
            rows={report.real_drift.ghost_in_facilities}
          />
          <Bucket
            variant="real"
            title="Unknown tags in finance"
            managerNote="Finance has a purchase record for an asset that hasn't appeared in ops. May be a data-entry error or an asset that was never received."
            action="Check the PO against physical inventory before marking retired."
            rows={report.real_drift.ghost_in_finance}
          />
          <Bucket
            variant="real"
            title="Location disagreement"
            managerNote="Ops and facilities record the same asset at different rack positions. Likely moved without scanning."
            action="Send a tech to confirm the physical location and run a deploy scan to update ops."
            rows={report.real_drift.location_mismatch}
          />
        </section>
      )}

      {ambiguousCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-yellow-700">Ambiguous — human judgment needed</h2>
            <p className="text-sm text-gray-500">These could be real problems or timing lags. Review before acting.</p>
          </div>
          <Bucket
            variant="ambiguous"
            title="In service but not in facilities"
            managerNote="Ops says this asset is racked and running, but facilities has no record of it. Could be a missed deploy scan, or the asset was never formally racked."
            action="Ask the custodian to run a deploy scan from the rack, or confirm it's actually not racked."
            rows={report.ambiguous.missing_from_facilities}
          />
          <Bucket
            variant="ambiguous"
            title="Disposed in ops, still capitalized in finance"
            managerNote="The asset has been removed from service in ops, but finance still lists it as capitalized. Could be a billing cycle lag or a write that didn't go through."
            action="Confirm with finance whether the asset has been written off. If not, trigger the finance update."
            rows={report.ambiguous.state_finance_conflict}
          />
          <Bucket
            variant="ambiguous"
            title="Stale facilities observation"
            managerNote={`Facilities hasn't recorded this asset in over ${STALE_DAYS} days, even though ops shows it as active. May just be an unvisited rack.`}
            action="Ask facilities to confirm the rack position on their next walkthrough."
            rows={report.ambiguous.stale_observation}
          />
        </section>
      )}

      {expectedCount > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-semibold text-gray-600">Expected — not a problem</h2>
            <p className="text-sm text-gray-500">These differences are explained by the scope of each system. No action needed.</p>
          </div>
          <Bucket
            variant="expected"
            title="Not tracked by facilities (in storage, receiving, or disposed)"
            managerNote="Facilities only tracks racked items. Assets in storage, receiving, RMA, or disposed won't appear there — this is by design."
            rows={report.expected.not_in_facilities}
          />
          <Bucket
            variant="expected"
            title="Not yet in finance"
            managerNote="Assets that haven't been received or capitalized don't appear in finance yet."
            rows={report.expected.not_in_finance}
          />
        </section>
      )}
    </div>
  );
}
