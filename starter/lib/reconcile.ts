import { createApiClient } from "./api-client";
import type { Asset, FacilitiesRecord, FinanceRecord } from "./types";

// Per CONTEXT.md: three parent categories — Expected, Real drift, Ambiguous
export type ReconcileRow = {
  asset_tag: string;
  ops?: Pick<Asset, "state" | "location" | "model" | "manufacturer" | "custodian">;
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

function opsRackString(asset: Asset): string {
  return [asset.location.site, asset.location.room, asset.location.row, asset.location.rack, asset.location.ru]
    .filter(Boolean)
    .join("/");
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

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
      ops: { state: asset.state, location: asset.location, model: asset.model, manufacturer: asset.manufacturer, custodian: asset.custodian },
      facilities: fac ? { rack_location: fac.rack_location, last_observed: fac.last_observed } : undefined,
      finance: fin ? { status: fin.status, site: fin.site, book_value_usd: fin.book_value_usd, capitalized_on: fin.capitalized_on } : undefined,
      detail,
    });

    // Expected: facilities only tracks racked items
    const notTrackedByFacilities = ["received", "stored", "disposed", "unreceived", "rma_pending"].includes(asset.state);
    if (notTrackedByFacilities && !fac) {
      report.expected.not_in_facilities.push(row(`${asset.state} — facilities only tracks racked items`));
      continue;
    }

    // Ambiguous: in_service but nothing in facilities
    if (asset.state === "in_service" && !fac) {
      report.ambiguous.missing_from_facilities.push(row("Asset is in service but has no facilities record — may need a deploy scan"));
      continue;
    }

    // Real drift: location mismatch
    if (asset.state === "in_service" && fac) {
      const opsRack = opsRackString(asset);
      if (fac.rack_location && asset.location.rack && !fac.rack_location.includes(asset.location.rack)) {
        report.real_drift.location_mismatch.push(row(`Ops rack: ${asset.location.rack} — Facilities: ${fac.rack_location}`));
      } else if (fac.rack_location && opsRack && !fac.rack_location.startsWith(asset.location.site ?? "")) {
        report.real_drift.location_mismatch.push(row(`Ops: ${opsRack} — Facilities: ${fac.rack_location}`));
      }

      // Ambiguous: stale facilities observation
      if (daysSince(fac.last_observed) > STALE_DAYS) {
        report.ambiguous.stale_observation.push(
          row(`Facilities record is ${Math.floor(daysSince(fac.last_observed))} days old while asset is active in ops`),
        );
      }
    }

    // Ambiguous: state/finance conflict
    if (fin && (asset.state === "disposed" || asset.state === "rma_pending") && fin.status === "capitalized") {
      report.ambiguous.state_finance_conflict.push(
        row(`Ops is ${asset.state} but finance still shows ${fin.status} — may be a billing lag or missed write`),
      );
    }
  }

  // Real drift: ghost in facilities (tag exists there but not in ops)
  for (const fac of facilitiesRaw) {
    if (!opsByTag.has(fac.tagged_id)) {
      report.real_drift.ghost_in_facilities.push({
        asset_tag: fac.tagged_id,
        facilities: { rack_location: fac.rack_location, last_observed: fac.last_observed },
        detail: "Tag in facilities but unknown to ops — may have been disposed without scanning",
      });
    }
  }

  // Real drift: ghost in finance (tag exists there but not in ops)
  for (const fin of financeRaw) {
    if (!opsByTag.has(fin.tag)) {
      report.real_drift.ghost_in_finance.push({
        asset_tag: fin.tag,
        finance: { status: fin.status, site: fin.site, book_value_usd: fin.book_value_usd, capitalized_on: fin.capitalized_on },
        detail: "Tag in finance but unknown to ops — investigate before marking retired",
      });
    }
  }

  return report;
}
