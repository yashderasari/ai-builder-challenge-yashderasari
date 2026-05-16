import Link from "next/link";
import { createApiClient, ApiError } from "@/lib/api-client";
import { StateBadge } from "@/components/StateBadge";
import { EventLog } from "@/components/EventLog";
import { CLASS_LABELS, formatLocation, formatDate } from "@/lib/format";
import type { Asset, Event, FacilitiesRecord, FinanceRecord } from "@/lib/types";

type AssetIssue = {
  severity: "real" | "ambiguous";
  title: string;
  explanation: string;
};

function getAssetIssues(
  asset: Asset,
  fac: FacilitiesRecord | null,
  fin: FinanceRecord | null,
): AssetIssue[] {
  const issues: AssetIssue[] = [];
  const notRacked = ["received", "stored", "disposed", "unreceived", "rma_pending"].includes(asset.state);
  const stateLabel: Record<string, string> = {
    stored: "moved to storage",
    received: "sitting in receiving",
    rma_pending: "sent out for repair",
    disposed: "marked as disposed",
    unreceived: "not yet received",
  };

  // Still racked in facilities despite leaving service
  if (notRacked && fac) {
    issues.push({
      severity: "real",
      title: asset.state === "disposed"
        ? "Disposed but Facilities still shows it racked"
        : `${stateLabel[asset.state] ?? "No longer in service"}, but Facilities still shows it racked`,
      explanation: asset.state === "disposed"
        ? "This asset was marked as disposed in Operations, but Facilities still has it listed at a rack position. The de-rack scan was skipped when it was retired. Facilities needs to remove the rack record — the asset doesn't need to physically move."
        : `Operations shows this asset as ${stateLabel[asset.state] ?? "out of service"}, but Facilities still has it listed at a rack position. The de-rack scan was missed when it left service. Facilities needs to remove the rack record — no physical move required.`,
    });
  }

  // In service but no facilities record at all
  if (asset.state === "in_service" && !fac) {
    issues.push({
      severity: "ambiguous",
      title: "Deployed and in use, but no rack record in Facilities",
      explanation: "Operations shows this asset as deployed and actively in use, but Facilities has no rack entry for it. This usually means the deploy scan completed in Operations but the rack record didn't write through to Facilities. If the asset is physically racked, a tech can rescan it to create the record.",
    });
  }

  // Location mismatches (in_service with a facilities record)
  if (asset.state === "in_service" && fac) {
    const rackMismatch = fac.rack_location && asset.location.rack && !fac.rack_location.includes(asset.location.rack);
    const ruMismatch = !rackMismatch && fac.rack_location && asset.location.ru && !fac.rack_location.includes(String(asset.location.ru));
    const siteMismatch = !rackMismatch && !ruMismatch && fac.rack_location && asset.location.site && !fac.rack_location.startsWith(asset.location.site);

    if (rackMismatch) {
      issues.push({
        severity: "real",
        title: `Rack conflict: Operations says ${asset.location.rack}, Facilities says ${fac.rack_location}`,
        explanation: "Operations and Facilities agree this asset is racked, but they disagree on which rack. Someone moved it without scanning, or one system has a stale entry. Send a tech to physically find the asset and rescan it from the correct rack — whichever system is wrong will update automatically.",
      });
    } else if (ruMismatch) {
      issues.push({
        severity: "real",
        title: `Rack unit conflict: Operations says unit ${asset.location.ru}, Facilities says ${fac.rack_location}`,
        explanation: "Operations and Facilities agree on the rack, but disagree on which slot (rack unit) this asset occupies. Someone may have shifted it without scanning. Send a tech to verify the exact slot and rescan.",
      });
    } else if (siteMismatch) {
      issues.push({
        severity: "real",
        title: `Site conflict: Operations says ${asset.location.site}, Facilities says ${fac.rack_location}`,
        explanation: "Operations and Facilities show this asset at completely different sites (buildings). An asset can only be in one place — one of these records is wrong. Send a tech to the physical location and rescan to correct both systems.",
      });
    }

    // Stale facilities observation
    const daysSince = (Date.now() - new Date(fac.last_observed).getTime()) / 86_400_000;
    if (daysSince > 90) {
      issues.push({
        severity: "ambiguous",
        title: `Facilities last confirmed this asset ${Math.floor(daysSince)} days ago`,
        explanation: `Facilities hasn't logged this asset since ${formatDate(fac.last_observed)}, but Operations shows it as active and in service. It may still be in place and just not scanned recently, or it may have quietly moved. Have a tech visit the listed rack to verify it's still there and rescan to refresh the record.`,
      });
    }
  }

  // Finance out of sync with ops state
  if (fin && (asset.state === "disposed" || asset.state === "rma_pending") && fin.status === "capitalized") {
    issues.push({
      severity: "ambiguous",
      title: asset.state === "disposed"
        ? "Disposed in Operations, but Finance still carries it as an active asset"
        : "Out for repair, but Finance still carries it as an active asset",
      explanation: asset.state === "disposed"
        ? "Operations has marked this asset as disposed, but Finance still lists it as a capitalized asset on the books. No field action is needed — Finance should write it off or adjust the record on their end."
        : "Operations shows this asset is currently out for repair, but Finance still lists it as a fully capitalized active asset. Finance may need to adjust the record to reflect its repair status. No field action needed.",
    });
  }

  return issues;
}

export default async function ManagerAssetDetailPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<React.ReactElement> {
  const { tag } = await params;
  const client = createApiClient();

  let asset: Asset | null = null;
  let events: Event[] = [];
  let facilitiesRecord: FacilitiesRecord | null = null;
  let financeRecord: FinanceRecord | null = null;

  try {
    [[asset, events], [facilitiesRecord, financeRecord]] = await Promise.all([
      Promise.all([client.assets.get(tag), client.assets.history(tag)]),
      Promise.all([
        client.mock.facilities().then(all => all.find(f => f.tagged_id === tag) ?? null),
        client.mock.finance().then(all => all.find(f => f.tag === tag) ?? null),
      ]),
    ]);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
    // Ghost asset — not in ops. Try to pull data from facilities and finance.
    try {
      const [allFac, allFin] = await Promise.all([
        client.mock.facilities(),
        client.mock.finance(),
      ]);
      facilitiesRecord = allFac.find(f => f.tagged_id === tag) ?? null;
      financeRecord = allFin.find(f => f.tag === tag) ?? null;
    } catch {
      // If mock endpoints also fail, we'll show a minimal error card below.
    }

    const sources = [facilitiesRecord && "Facilities", financeRecord && "Finance"].filter(Boolean).join(" and ");

    return (
      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/manager" className="hover:text-gray-800">Assets</Link>
          <span>›</span>
          <Link href="/manager/reconcile" className="hover:text-gray-800">Reconciliation</Link>
          <span>›</span>
          <span className="font-mono text-gray-800">{tag}</span>
        </div>

        {/* Ghost asset warning */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 space-y-2">
          <p className="font-semibold text-red-900">Tag not registered in ops</p>
          <p className="text-sm text-red-800">
            <span className="font-mono">{tag}</span> doesn&apos;t exist in the operations system — it was never received or was removed without proper scanning.
            {sources ? ` It appears in ${sources}, which is why it shows up in the reconciliation report.` : " It was referenced in the reconciliation report but cannot be found in any system now."}
          </p>
          <p className="text-sm text-red-700">
            To resolve this: send a tech to verify the physical equipment, then either receive it (if it&apos;s real hardware) or remove the stale record from {sources || "the external system"}.
          </p>
        </div>

        {/* Identity stub */}
        <div className="rounded-lg border bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-2xl font-bold text-gray-900">{tag}</p>
              <p className="text-gray-400 mt-1 text-sm">Not registered in ops — no model or manufacturer on record</p>
            </div>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">Ghost</span>
          </div>
        </div>

        {/* Facilities data */}
        {facilitiesRecord && (
          <div className="rounded-lg border bg-white p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">Facilities record</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Rack location</p>
                <p className="text-gray-800 font-mono">{facilitiesRecord.rack_location || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Last observed</p>
                <p className="text-gray-800">{formatDate(facilitiesRecord.last_observed)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Finance data */}
        {financeRecord && (
          <div className="rounded-lg border bg-white p-6 space-y-3">
            <h2 className="font-semibold text-gray-900">Finance record</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Status</p>
                <p className="text-gray-800 capitalize">{financeRecord.status}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Site</p>
                <p className="text-gray-800">{financeRecord.site || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase font-medium mb-1">Book value</p>
                <p className="text-gray-800">{financeRecord.book_value_usd != null ? `$${financeRecord.book_value_usd.toLocaleString()}` : "—"}</p>
              </div>
              {financeRecord.capitalized_on && (
                <div>
                  <p className="text-xs text-gray-400 uppercase font-medium mb-1">Capitalized on</p>
                  <p className="text-gray-800">{formatDate(financeRecord.capitalized_on)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-sm text-gray-500">
          <Link href="/manager/reconcile" className="text-blue-600 hover:underline">← Back to reconciliation report</Link>
        </div>
      </div>
    );
  }

  const issues = getAssetIssues(asset, facilitiesRecord, financeRecord);

  const identityCard = (
    <div className="rounded-lg border bg-white p-6 space-y-4 h-fit">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-2xl font-bold text-gray-900">{asset.asset_tag}</p>
          <p className="text-gray-600 mt-1">{asset.manufacturer} {asset.model}</p>
          <p className="text-sm text-gray-400 mt-0.5">{CLASS_LABELS[asset.asset_class]} · {asset.serial}</p>
        </div>
        <StateBadge state={asset.state} />
      </div>

      <div className="border-t pt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium mb-1">Custodian</p>
          <p className="text-gray-800">{asset.custodian}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium mb-1">Location</p>
          <p className="text-gray-800">{formatLocation(asset.location) || "—"}</p>
        </div>
        {asset.parent_asset_tag && (
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">Parent asset</p>
            <Link href={`/manager/assets/${asset.parent_asset_tag}`} className="text-blue-600 hover:underline font-mono">
              {asset.parent_asset_tag}
            </Link>
          </div>
        )}
        <div>
          <p className="text-xs text-gray-400 uppercase font-medium mb-1">Last updated</p>
          <p className="text-gray-800">{formatDate(asset.updated_at)}</p>
        </div>
        {asset.procurement_note && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">Procurement note</p>
            <p className="text-gray-700 italic">{asset.procurement_note}</p>
          </div>
        )}
      </div>
    </div>
  );

  const alertsPanel = issues.length > 0 ? (
    <div className="space-y-3 h-fit">
      <h2 className="font-semibold text-gray-900">Reconciliation alerts</h2>
      <div className="space-y-3">
        {issues.map((issue, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 space-y-1.5 ${
              issue.severity === "real"
                ? "border-red-200 bg-red-50"
                : "border-yellow-200 bg-yellow-50"
            }`}
          >
            <span className={`text-xs font-semibold uppercase tracking-wide ${
              issue.severity === "real" ? "text-red-700" : "text-yellow-700"
            }`}>
              {issue.severity === "real" ? "Action needed" : "Needs review"}
            </span>
            <p className={`font-medium text-sm ${
              issue.severity === "real" ? "text-red-900" : "text-yellow-900"
            }`}>
              {issue.title}
            </p>
            <p className={`text-sm ${
              issue.severity === "real" ? "text-red-700" : "text-yellow-700"
            }`}>
              {issue.explanation}
            </p>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/manager" className="hover:text-gray-800">Assets</Link>
        <span>›</span>
        <span className="font-mono text-gray-800">{tag}</span>
      </div>

      {/* Identity card + alerts side by side when issues exist */}
      {alertsPanel ? (
        <div className="grid grid-cols-2 gap-6 items-start">
          {identityCard}
          {alertsPanel}
        </div>
      ) : identityCard}

      {/* Event log */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Event history</h2>
          <span className="text-sm text-gray-400">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        </div>
        <EventLog events={events} />
      </div>
    </div>
  );
}
