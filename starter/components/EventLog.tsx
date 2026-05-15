import type { Event } from "@/lib/types";
import { StateBadge } from "./StateBadge";
import { formatDate, formatLocation } from "@/lib/format";
import type { AssetState } from "@/lib/types";

function EventTypeBadge({ type }: { type: Event["event_type"] }) {
  const labels: Record<Event["event_type"], string> = {
    receive: "Received",
    store: "Stored",
    deploy: "Deployed",
    rma_open: "RMA opened",
    rma_receive_back: "RMA returned",
    dispose: "Disposed",
    duplicate_receive: "Duplicate receive",
    transfer_custody: "Custody transfer",
  };
  return (
    <span className="text-xs font-medium text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
      {labels[type]}
    </span>
  );
}

type Props = { events: Event[] };

export function EventLog({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
        <p className="text-gray-400 text-sm">No events recorded yet.</p>
      </div>
    );
  }

  return (
    <ol className="relative border-l border-gray-200 space-y-6 ml-3">
      {events.map(ev => (
        <li key={ev.id} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-gray-300" />
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <EventTypeBadge type={ev.event_type} />
              {ev.from_state && ev.to_state && ev.from_state !== ev.to_state && (
                <div className="flex items-center gap-1.5">
                  <StateBadge state={ev.from_state as AssetState} />
                  <span className="text-gray-400 text-xs">→</span>
                  <StateBadge state={ev.to_state as AssetState} />
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {formatDate(ev.timestamp)} · {ev.user_id}
            </p>
            {ev.to_location && (
              <p className="text-xs text-gray-400">
                {formatLocation(ev.to_location)}
              </p>
            )}
            {ev.event_type === "transfer_custody" && ev.scan_payload && (
              <p className="text-xs text-gray-500">To: {ev.scan_payload}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
