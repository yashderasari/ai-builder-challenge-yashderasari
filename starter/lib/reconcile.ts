import { createApiClient } from "./api-client";
import type { Asset, FacilitiesRecord, FinanceRecord } from "./types";

// Per CONTEXT.md: three parent categories — Expected, Real drift, Ambiguous
export type ReconcileRow = {
  asset_tag: string;
  ops?: Pick<Asset, "state" | "location" | "model" | "manufacturer" | "custodian" | "updated_at">;
  facilities?: Pick<FacilitiesRecord, "rack_location" | "last_observed">;
  finance?: Pick<FinanceRecord, "status" | "site" | "book_value_usd" | "capitalized_on">;
  detail: string;
};

export type ReconcileReport = {
  generated_at: string;
  totals: { ops: number; facilities: number; finance: number };
  expected: {
    not_in_facilities: ReconcileRow[];
    not_in_finance: ReconcileRow[];
  };
  real_drift: {
    location_mismatch: ReconcileRow[];
    ghost_in_facilities: ReconcileRow[];
    ghost_in_finance: ReconcileRow[];
  };
  ambiguous: {
    state_finance_conflict: ReconcileRow[];
    missing_from_facilities: ReconcileRow[];
    stale_observation: ReconcileRow[];
  };
};

export const STALE_DAYS = 90;

export function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function opsRackString(asset: Asset): string {
  return [asset.location.site, asset.location.room, asset.location.row, asset.location.rack, asset.location.ru]
    .filter(Boolean)
    .join("/");
}

const STATE_DESCRIPTION: Record<string, string> = {
  received:    "sitting in receiving",
  stored:      "moved to storage",
  rma_pending: "sent for RMA repair",
  disposed:    "marked as disposed",
  unreceived:  "not yet received",
};

export async function buildReconcileReport(): Promise<ReconcileReport> {
  const client = createApiClient();

  const [allAssets, facilitiesRaw, financeRaw] = await Promise.all([
    client.assets.list(),
    client.mock.facilities(),
    client.mock.finance(),
  ]);

  const opsByTag = new Map(allAssets.map(a => [a.asset_tag, a]));
  const facilitiesByTag = new Map(facilitiesRaw.map(f => [f.tagged_id, f]));
  const financeByTag = new Map(financeRaw.map(f => [f.tag, f]));

  const report: ReconcileReport = {
    generated_at: new Date().toISOString(),
    totals: { ops: allAssets.length, facilities: facilitiesRaw.length, finance: financeRaw.length },
    expected: { not_in_facilities: [], not_in_finance: [] },
    real_drift: { location_mismatch: [], ghost_in_facilities: [], ghost_in_finance: [] },
    ambiguous: { state_finance_conflict: [], missing_from_facilities: [], stale_observation: [] },
  };

  for (const asset of allAssets) {
    const fac = facilitiesByTag.get(asset.asset_tag);
    const fin = financeByTag.get(asset.asset_tag);

    const row = (detail: string): ReconcileRow => ({
      asset_tag: asset.asset_tag,
      ops: { state: asset.state, location: asset.location, model: asset.model, manufacturer: asset.manufacturer, custodian: asset.custodian, updated_at: asset.updated_at },
      facilities: fac ? { rack_location: fac.rack_location, last_observed: fac.last_observed } : undefined,
      finance: fin ? { status: fin.status, site: fin.site, book_value_usd: fin.book_value_usd, capitalized_on: fin.capitalized_on } : undefined,
      detail,
    });

    // Expected: facilities only tracks racked items
    const notTrackedByFacilities = ["received", "stored", "disposed", "unreceived", "rma_pending"].includes(asset.state);
    if (notTrackedByFacilities && !fac) {
      const facilityNote: Record<string, string> = {
        received:    "In receiving — not racked yet",
        stored:      "In storage — not racked",
        rma_pending: "Out for repair — not tracked",
        disposed:    "Disposed — no longer tracked",
        unreceived:  "Not yet received into ops",
      };
      report.expected.not_in_facilities.push(row(facilityNote[asset.state] ?? "Not currently racked"));
      continue;
    }

    // Real drift: asset is no longer racked in ops, but facilities still has it at a rack position
    if (notTrackedByFacilities && fac) {
      const stateDesc = STATE_DESCRIPTION[asset.state] ?? "in a non-racked state";
      if (asset.state === "disposed") {
        report.real_drift.location_mismatch.push(
          row("Disposed but still racked in facilities"),
        );
      } else {
        report.real_drift.location_mismatch.push(
          row("De-rack step skipped in facilities"),
        );
      }
      // Don't continue — still check finance conflict below
    }

    // Ambiguous: in_service but nothing in facilities
    if (asset.state === "in_service" && !fac) {
      report.ambiguous.missing_from_facilities.push(row("In service, no facilities record"));
      continue;
    }

    // Real drift: location mismatch (in_service assets only)
    if (asset.state === "in_service" && fac) {
      const opsRack = opsRackString(asset);

      // Rack-level mismatch: different rack entirely
      const rackMismatch = fac.rack_location && asset.location.rack && !fac.rack_location.includes(asset.location.rack);
      // RU-level mismatch: same rack but different rack unit
      const ruMismatch = !rackMismatch && fac.rack_location && asset.location.ru && !fac.rack_location.includes(asset.location.ru);
      // Site-level mismatch: different building
      const siteMismatch = !rackMismatch && !ruMismatch && fac.rack_location && opsRack && !fac.rack_location.startsWith(asset.location.site ?? "");

      if (rackMismatch) {
        report.real_drift.location_mismatch.push(row(`Rack mismatch: ${asset.location.rack} vs facilities`));
      } else if (ruMismatch) {
        report.real_drift.location_mismatch.push(row(`Rack unit mismatch: ${asset.location.ru} vs facilities`));
      } else if (siteMismatch) {
        report.real_drift.location_mismatch.push(row(`Site mismatch: ops vs facilities`));
      }

      // Ambiguous: stale facilities observation
      if (daysSince(fac.last_observed) > STALE_DAYS) {
        report.ambiguous.stale_observation.push(
          row(`Facilities record ${Math.floor(daysSince(fac.last_observed))}d old, asset active`),
        );
      }
    }

    // Ambiguous: state/finance conflict
    if (fin && (asset.state === "disposed" || asset.state === "rma_pending") && fin.status === "capitalized") {
      report.ambiguous.state_finance_conflict.push(
        row(asset.state === "disposed"
          ? "Disposed, still on finance books"
          : "Out for repair, still on the books"),
      );
    }
  }

  // Real drift: ghost in facilities (tag exists there but not in ops)
  for (const fac of facilitiesRaw) {
    if (!opsByTag.has(fac.tagged_id)) {
      report.real_drift.ghost_in_facilities.push({
        asset_tag: fac.tagged_id,
        facilities: { rack_location: fac.rack_location, last_observed: fac.last_observed },
        detail: "Ghost in facilities, unknown to ops",
      });
    }
  }

  // Real drift: ghost in finance (tag exists there but not in ops)
  for (const fin of financeRaw) {
    if (!opsByTag.has(fin.tag)) {
      report.real_drift.ghost_in_finance.push({
        asset_tag: fin.tag,
        finance: { status: fin.status, site: fin.site, book_value_usd: fin.book_value_usd, capitalized_on: fin.capitalized_on },
        detail: "Ghost in finance, unknown to ops",
      });
    }
  }

  return report;
}
