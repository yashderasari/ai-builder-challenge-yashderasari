import type { AssetState } from "@/lib/types";
import { STATE_LABELS, STATE_COLORS } from "@/lib/format";

export function StateBadge({ state }: { state: AssetState }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_COLORS[state]}`}>
      {STATE_LABELS[state]}
    </span>
  );
}
