import type { Asset } from "@/lib/types";
import { StateBadge } from "./StateBadge";
import { CLASS_LABELS, formatLocation } from "@/lib/format";

type AssetCardProps = {
  asset: Asset;
  heading?: string;
};

export function AssetCard({ asset, heading }: AssetCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      {heading && <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{heading}</p>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono font-semibold text-lg">{asset.asset_tag}</p>
          <p className="text-gray-800">{asset.manufacturer} {asset.model}</p>
          <p className="text-sm text-gray-500">{CLASS_LABELS[asset.asset_class]} · {asset.serial}</p>
        </div>
        <StateBadge state={asset.state} />
      </div>
      <div className="text-sm text-gray-600 space-y-1">
        <p><span className="text-gray-400">Location:</span> {formatLocation(asset.location) || "—"}</p>
        <p><span className="text-gray-400">Custodian:</span> {asset.custodian}</p>
        {asset.procurement_note && (
          <p><span className="text-gray-400">Note:</span> {asset.procurement_note}</p>
        )}
      </div>
    </div>
  );
}
