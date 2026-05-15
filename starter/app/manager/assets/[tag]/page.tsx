import { notFound } from "next/navigation";
import Link from "next/link";
import { createApiClient, ApiError } from "@/lib/api-client";
import { StateBadge } from "@/components/StateBadge";
import { EventLog } from "@/components/EventLog";
import { CLASS_LABELS, formatLocation, formatDate } from "@/lib/format";

export default async function ManagerAssetDetailPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<React.ReactElement> {
  const { tag } = await params;
  const client = createApiClient();

  let asset, events;
  try {
    [asset, events] = await Promise.all([
      client.assets.get(tag),
      client.assets.history(tag),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/manager" className="hover:text-gray-800">Assets</Link>
        <span>›</span>
        <span className="font-mono text-gray-800">{tag}</span>
      </div>

      {/* Identity card */}
      <div className="rounded-lg border bg-white p-6 space-y-4">
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
