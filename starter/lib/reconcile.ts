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
  verified_clean: number;  // in_service assets confirmed by all 3 systems with no conflicts
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
    // Facilities has a more recent scan than the Ops state change — can't blindly trust Ops
    facilities_newer_than_ops: ReconcileRow[];
  };
  // Cannot confirm without additional data — not "clean", not "drifted"
  unaudited: {
    no_facilities_record: ReconcileRow[];  // stored assets with no Facilities scan on record
    no_finance_record: ReconcileRow[];     // assets Ops knows about that Finance has never recorded
  };
};

export const STALE_DAYS = 90;

export function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

// Full outer join record — every asset tag from any system gets one of these
type JoinedAsset = {
  asset_tag: string;
  ops?: Asset;
  facilities?: FacilitiesRecord;
  finance?: FinanceRecord;
};

function opsRackString(asset: Asset): string {
  return [asset.location.site, asset.location.room, asset.location.row, asset.location.rack, asset.location.ru]
    .filter(Boolean)
    .join("/");
}

const STATE_DESCRIPTION: Record<string, string> = {
  received: "sitting in receiving",
  stored: "moved to storage",
  rma_pending: "sent for RMA repair",
  disposed: "marked as disposed",
  unreceived: "not yet received",
};

function makeRow(joined: JoinedAsset, detail: string): ReconcileRow {
  const { asset_tag, ops, facilities, finance } = joined;
  return {
    asset_tag,
    ops: ops ? { state: ops.state, location: ops.location, model: ops.model, manufacturer: ops.manufacturer, custodian: ops.custodian, updated_at: ops.updated_at } : undefined,
    facilities: facilities ? { rack_location: facilities.rack_location, last_observed: facilities.last_observed } : undefined,
    finance: finance ? { status: finance.status, site: finance.site, book_value_usd: finance.book_value_usd, capitalized_on: finance.capitalized_on } : undefined,
    detail,
  };
}

export async function buildReconcileReport(): Promise<ReconcileReport> {
  const client = createApiClient();

  const [allAssets, facilitiesRaw, financeRaw] = await Promise.all([
    client.assets.list(),
    client.mock.facilities(),
    client.mock.finance(),
  ]);

  // ── Full outer join on asset_tag ──────────────────────────────────────────
  const opsByTag = new Map(allAssets.map(a => [a.asset_tag, a]));
  const facilitiesByTag = new Map(facilitiesRaw.map(f => [f.tagged_id, f]));
  const financeByTag = new Map(financeRaw.map(f => [f.tag, f]));

  // Union of all known tags across all three systems
  const allTags = new Set([
    ...allAssets.map(a => a.asset_tag),
    ...facilitiesRaw.map(f => f.tagged_id),
    ...financeRaw.map(f => f.tag),
  ]);

  const joined: JoinedAsset[] = Array.from(allTags).map(tag => ({
    asset_tag: tag,
    ops: opsByTag.get(tag),
    facilities: facilitiesByTag.get(tag),
    finance: financeByTag.get(tag),
  }));

  // ── Categorize each joined record ─────────────────────────────────────────
  const report: ReconcileReport = {
    generated_at: new Date().toISOString(),
    totals: { ops: allAssets.length, facilities: facilitiesRaw.length, finance: financeRaw.length },
    verified_clean: 0,  // computed after categorization
    expected: { not_in_facilities: [], not_in_finance: [] },
    real_drift: { location_mismatch: [], ghost_in_facilities: [], ghost_in_finance: [] },
    ambiguous: { state_finance_conflict: [], missing_from_facilities: [], stale_observation: [], facilities_newer_than_ops: [] },
    unaudited: { no_facilities_record: [], no_finance_record: [] },
  };

  for (const j of joined) {
    const { ops, facilities, finance } = j;

    // ── Ghost cases: tag exists in one system but not Ops ─────────────────

    if (!ops) {
      if (facilities) {
        const detail = !finance
          ? "Physically racked with no record in Operations or Finance — untracked asset with no procurement or intake history"
          : finance.status === "pending_receipt"
            ? "Physically racked but never received into Operations — Finance raised a PO but the receive scan was skipped"
            : "Physically racked with no Operations record — Finance has it capitalized but Ops has never seen it";
        report.real_drift.ghost_in_facilities.push(makeRow(j, detail));
      } else if (finance) {
        report.real_drift.ghost_in_finance.push(makeRow(j, "Finance has a record — Operations doesn't"));
      }
      continue;
    }

    // From here: ops exists
    const notRacked = ["received", "stored", "disposed", "unreceived", "rma_pending"].includes(ops.state);

    // ── Facilities checks ─────────────────────────────────────────────────

    if (notRacked && !facilities) {
      if (ops.state === "stored" || ops.state === "received") {
        const detail = ops.state === "stored"
          ? "Stored in Operations — physically on-premises but no Facilities audit record to confirm location"
          : "In receiving — physically on-premises but no Facilities audit record to confirm location";
        report.unaudited.no_facilities_record.push(makeRow(j, detail));
      } else {
        const facilityNote: Record<string, string> = {
          rma_pending: "Out for repair — not tracked by Facilities",
          disposed: "Disposed — no longer tracked by Facilities",
          unreceived: "Not yet received — no Facilities record expected",
        };
        report.expected.not_in_facilities.push(makeRow(j, facilityNote[ops.state] ?? "Not currently racked"));
      }
    } else if (notRacked && facilities) {
      const facTs = new Date(facilities.last_observed).getTime();
      const opsTs = new Date(ops.updated_at).getTime();
      const facIsMoreRecent = facTs > opsTs;

      if (facIsMoreRecent) {
        if (ops.state === "disposed") {
          report.ambiguous.facilities_newer_than_ops.push(
            makeRow(j, "Latest Facilities scan conflicts with last Ops update — disposed asset still showing racked"),
          );
        } else {
          report.ambiguous.facilities_newer_than_ops.push(
            makeRow(j, `Latest Facilities scan conflicts with last Ops update — ${STATE_DESCRIPTION[ops.state] ?? "non-racked"} in Ops but Facilities sees it racked`),
          );
        }
      } else {
        if (ops.state === "disposed") {
          report.real_drift.location_mismatch.push(
            makeRow(j, "Disposed in Operations — Facilities still shows it as racked"),
          );
        } else {
          report.real_drift.location_mismatch.push(
            makeRow(j, "Removed from Operations — Facilities wasn't updated"),
          );
        }
      }
    } else if (ops.state === "in_service" && !facilities) {
      report.ambiguous.missing_from_facilities.push(makeRow(j, "Active in Operations — no Facilities scan on record"));
    } else if (ops.state === "in_service" && facilities) {
      const opsRack = opsRackString(ops);
      const rackMismatch = facilities.rack_location && ops.location.rack && !facilities.rack_location.includes(ops.location.rack);
      const ruMismatch = !rackMismatch && facilities.rack_location && ops.location.ru && !facilities.rack_location.includes(ops.location.ru);
      const siteMismatch = !rackMismatch && !ruMismatch && facilities.rack_location && opsRack && !facilities.rack_location.startsWith(ops.location.site ?? "");

      if (rackMismatch) {
        report.real_drift.location_mismatch.push(makeRow(j, `Location conflict: Operations says rack ${ops.location.rack}, Facilities disagrees`));
      } else if (ruMismatch) {
        report.real_drift.location_mismatch.push(makeRow(j, `Location conflict: Operations says slot ${ops.location.ru}, Facilities disagrees`));
      } else if (siteMismatch) {
        report.real_drift.location_mismatch.push(makeRow(j, `Location conflict: Operations and Facilities show different buildings`));
      }

      if (daysSince(facilities.last_observed) > STALE_DAYS) {
        report.ambiguous.stale_observation.push(
          makeRow(j, `Facilities last scanned ${Math.floor(daysSince(facilities.last_observed))} days ago — asset still active`),
        );
      }
    }

    // ── Finance checks ────────────────────────────────────────────────────

    if (!finance) {
      if (ops.state === "received" || ops.state === "stored") {
        report.real_drift.ghost_in_finance.push(
          makeRow(j, "No Finance record — asset is physically on-premises in Operations but Finance has no procurement entry"),
        );
      } else if (ops.state !== "unreceived") {
        report.unaudited.no_finance_record.push(
          makeRow(j, "No Finance record — Operations has no matching procurement entry for this asset"),
        );
      }
    } else if (ops.state === "disposed") {
      if (finance.status === "capitalized") {
        report.real_drift.ghost_in_finance.push(
          makeRow(j, "Disposed in Operations — Finance still shows it as active, should be retired"),
        );
      } else if (finance.status === "impaired") {
        report.ambiguous.state_finance_conflict.push(
          makeRow(j, "Disposed in Operations — Finance marked it impaired but has not retired it yet"),
        );
      }
      // finance.status === "retired" → clean, no flag
    } else if (ops.state === "rma_pending") {
      if (finance.status === "capitalized") {
        report.ambiguous.state_finance_conflict.push(
          makeRow(j, "Out for repair — Finance still shows it as active, should be marked impaired"),
        );
      } else if (finance.status === "retired") {
        report.real_drift.ghost_in_finance.push(
          makeRow(j, "Out for repair — Finance has already retired it, but Operations expects it back"),
        );
      }
      // finance.status === "impaired" → clean, no flag
    }
  }

  // Verified clean: must satisfy all three conditions explicitly
  //   1. Ops: in_service (deployed)
  //   2. Facilities: racked with no location mismatch and scan not stale
  //   3. Finance: capitalized with no conflict
  report.verified_clean = allAssets.filter(a => {
    if (a.state !== "in_service") return false;

    const fac = facilitiesByTag.get(a.asset_tag);
    if (!fac) return false;  // not racked in Facilities
    if (daysSince(fac.last_observed) > STALE_DAYS) return false;  // stale scan

    // Location must match — rack and RU must agree
    const rackMismatch = fac.rack_location && a.location.rack && !fac.rack_location.includes(a.location.rack);
    const ruMismatch = !rackMismatch && fac.rack_location && a.location.ru && !fac.rack_location.includes(a.location.ru);
    const siteMismatch = !rackMismatch && !ruMismatch && fac.rack_location && !fac.rack_location.startsWith(a.location.site ?? "");
    if (rackMismatch || ruMismatch || siteMismatch) return false;

    const fin = financeByTag.get(a.asset_tag);
    if (!fin) return false;  // no finance record
    if (fin.status !== "capitalized") return false;  // not capitalized

    return true;
  }).length;

  return report;
}
