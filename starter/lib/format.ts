import type { AssetClass, AssetState, Location } from "./types.js";

export const STATE_LABELS: Record<AssetState, string> = {
  unreceived: "Not yet received",
  received: "In receiving",
  stored: "In storage",
  in_service: "In service",
  rma_pending: "RMA pending",
  disposed: "Disposed",
};

export const STATE_COLORS: Record<AssetState, string> = {
  unreceived: "bg-gray-100 text-gray-700",
  received: "bg-blue-100 text-blue-800",
  stored: "bg-yellow-100 text-yellow-800",
  in_service: "bg-green-100 text-green-800",
  rma_pending: "bg-orange-100 text-orange-800",
  disposed: "bg-red-100 text-red-800",
};

export const CLASS_LABELS: Record<AssetClass, string> = {
  instrument: "Instrument",
  compute: "Compute",
  network: "Network",
  power: "Power",
  consumable_durable: "Consumable / Durable",
};

export function parseLocationBarcode(raw: string): Partial<Location> | null {
  const parts = raw.trim().split("/").map(s => s.trim()).filter(Boolean);
  if (parts.length < 1) return null;
  const [site, room, row, rack, ru] = parts;
  return {
    site: site ?? "",
    room: room ?? null,
    row: row ?? null,
    rack: rack ?? null,
    ru: ru ?? null,
  };
}

export function formatLocation(loc: Location): string {
  const parts = [loc.site, loc.room, loc.row, loc.rack, loc.ru ? `RU ${loc.ru}` : null];
  return parts.filter(Boolean).join(" › ");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formats an ISO timestamp as `yyyy-mm-dd hh:mm:ss` (UTC). Date-only strings pass through unchanged. */
export function formatTimestamp(iso: string): string {
  if (!iso) return "—";
  if (iso.includes("T")) {
    const idx = iso.indexOf("T");
    const date = iso.slice(0, idx);
    const time = iso.slice(idx + 1).replace("Z", "").split(".")[0];
    return `${date} ${time}`;
  }
  return iso; // already date-only e.g. "2025-09-20"
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
