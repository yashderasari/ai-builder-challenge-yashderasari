import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildReconcileReport } from "@/lib/reconcile";

// ---------------------------------------------------------------------------
// Fixtures — mirror the 12 hand-crafted seed assets and their mock records
// ---------------------------------------------------------------------------

const makeAsset = (overrides: Record<string, unknown>) => ({
  asset_tag: "C0000000",
  serial: "SN-TEST",
  model: "Test Model",
  manufacturer: "TestCo",
  asset_class: "compute",
  state: "in_service",
  location: { site: "Lab-A", room: "Bay-1", row: "Aisle-1", rack: "R-01", ru: "U01" },
  custodian: "tech-jane",
  parent_asset_tag: null,
  procurement_note: null,
  created_at: "2026-01-02T09:00:00.000Z",
  updated_at: "2026-01-02T09:00:00.000Z",
  ...overrides,
});

// OPS assets
const OPS_ASSETS = [
  // C0000101 — clean: in_service, matches facilities exactly
  makeAsset({
    asset_tag: "C0000101",
    state: "in_service",
    location: { site: "Lab-Building-A", room: "Bay-12", row: "Aisle-3", rack: "B-04", ru: "P-02" },
  }),
  // C0000102 — clean: in_service, matches facilities
  makeAsset({
    asset_tag: "C0000102",
    state: "in_service",
    location: { site: "Lab-Building-A", room: "Bay-12", row: "Aisle-3", rack: "B-05", ru: "P-01" },
  }),
  // C0000103 — clean: in_service, matches facilities
  makeAsset({
    asset_tag: "C0000103",
    state: "in_service",
    location: { site: "Lab-Building-A", room: "Telecom-1", row: "Aisle-1", rack: "T-01", ru: "U40" },
  }),
  // C0000104 — expected: stored, no facilities record
  makeAsset({
    asset_tag: "C0000104",
    state: "stored",
    location: { site: "Lab-Building-A", room: "Storage-1", row: null, rack: "SHELF-3", ru: null },
  }),
  // C0000105 — expected: stored, no facilities record
  makeAsset({
    asset_tag: "C0000105",
    state: "stored",
    location: { site: "Lab-Building-A", room: "Storage-1", row: null, rack: "SHELF-3", ru: null },
  }),
  // C0000106 — clean: in_service, matches facilities
  makeAsset({
    asset_tag: "C0000106",
    state: "in_service",
    location: { site: "Lab-Building-A", room: "Bay-12", row: "Aisle-3", rack: "B-04", ru: "U00" },
  }),
  // C0000107 — expected: received, no facilities record
  makeAsset({
    asset_tag: "C0000107",
    state: "received",
    location: { site: "Lab-Building-A", room: "Receiving", row: null, rack: "DOCK-2", ru: null },
  }),
  // C0000108 — real drift: rma_pending but facilities still shows rack
  makeAsset({
    asset_tag: "C0000108",
    state: "rma_pending",
    location: { site: "Lab-Building-A", room: "Staging-RMA", row: null, rack: "BIN-RMA-1", ru: null },
  }),
  // C0000109 — real drift: disposed but facilities still shows rack
  makeAsset({
    asset_tag: "C0000109",
    state: "disposed",
    location: { site: "Lab-Building-A", room: "Disposal", row: null, rack: "PALLET-9", ru: null },
  }),
  // C0000110 — real drift: in_service, rack unit mismatch (ops=U18, facilities=U16)
  makeAsset({
    asset_tag: "C0000110",
    state: "in_service",
    location: { site: "Lab-Building-B", room: "Computing-1", row: "Aisle-1", rack: "C-12", ru: "U18" },
  }),
  // C0000111 — ambiguous: in_service, locations match but facilities is stale (>90 days)
  makeAsset({
    asset_tag: "C0000111",
    state: "in_service",
    location: { site: "Lab-Building-B", room: "Computing-1", row: "Aisle-1", rack: "C-12", ru: "U20" },
  }),
  // C0000112 — expected: stored, no facilities record
  makeAsset({
    asset_tag: "C0000112",
    state: "stored",
    location: { site: "Lab-Building-B", room: "Storage-2", row: null, rack: "SHELF-1", ru: null },
  }),
];

// FACILITIES records — only for assets that should have one
const FAC_RECORDS = [
  { space_id: "fac-1001", tagged_id: "C0000101", rack_location: "Lab-Building-A/Bay-12/Aisle-3/B-04/P-02", last_observed: "2026-05-08T03:00:00Z" },
  { space_id: "fac-1002", tagged_id: "C0000102", rack_location: "Lab-Building-A/Bay-12/Aisle-3/B-05/P-01", last_observed: "2026-05-08T03:00:00Z" },
  { space_id: "fac-1003", tagged_id: "C0000103", rack_location: "Lab-Building-A/Telecom-1/Aisle-1/T-01/U40", last_observed: "2026-05-08T03:00:00Z" },
  { space_id: "fac-1006", tagged_id: "C0000106", rack_location: "Lab-Building-A/Bay-12/Aisle-3/B-04/U00", last_observed: "2026-05-08T03:00:00Z" },
  // C0000108: rma_pending but facilities still shows old rack (drift)
  { space_id: "fac-1108", tagged_id: "C0000108", rack_location: "Lab-Building-A/Bay-12/Aisle-3/B-06/U30", last_observed: "2026-04-21T19:00:00Z" },
  // C0000109: disposed but facilities still shows rack (drift)
  { space_id: "fac-1109", tagged_id: "C0000109", rack_location: "Lab-Building-A/Telecom-1/Aisle-1/T-02/U10", last_observed: "2026-03-15T08:00:00Z" },
  // C0000110: in_service, RU mismatch (U16 vs ops U18)
  { space_id: "fac-1110", tagged_id: "C0000110", rack_location: "Lab-Building-B/Computing-1/Aisle-1/C-12/U16", last_observed: "2026-05-08T03:00:00Z" },
  // C0000111: in_service, match but last_observed is stale (>90 days ago)
  { space_id: "fac-1111", tagged_id: "C0000111", rack_location: "Lab-Building-B/Computing-1/Aisle-1/C-12/U20", last_observed: "2025-11-02T03:00:00Z" },
  // Ghost: exists in facilities but not in ops
  { space_id: "fac-9001", tagged_id: "C0000199", rack_location: "Lab-Building-A/Bay-12/Aisle-3/B-07/U05", last_observed: "2026-05-08T03:00:00Z" },
];

// FINANCE records
const FIN_RECORDS = [
  { finance_id: "EQ-101", tag: "C0000101", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-102", tag: "C0000102", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-103", tag: "C0000103", site: "Lab-Building-A", book_value_usd: 45000,   status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-104", tag: "C0000104", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-105", tag: "C0000105", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-106", tag: "C0000106", site: "Lab-Building-A", book_value_usd: 8000,    status: "capitalized", capitalized_on: "2025-09-20" },
  { finance_id: "EQ-107", tag: "C0000107", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  // C0000108: rma_pending but finance still capitalized (ambiguous)
  { finance_id: "EQ-108", tag: "C0000108", site: "Lab-Building-A", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  // C0000109: disposed but finance still capitalized (ambiguous)
  { finance_id: "EQ-109", tag: "C0000109", site: "Lab-Building-A", book_value_usd: 875000,  status: "capitalized", capitalized_on: "2024-04-02" },
  { finance_id: "EQ-110", tag: "C0000110", site: "Lab-Building-B", book_value_usd: 32000,   status: "capitalized", capitalized_on: "2025-06-11" },
  { finance_id: "EQ-111", tag: "C0000111", site: "Lab-Building-B", book_value_usd: 32000,   status: "capitalized", capitalized_on: "2025-06-11" },
  { finance_id: "EQ-112", tag: "C0000112", site: "Lab-Building-B", book_value_usd: 1250000, status: "capitalized", capitalized_on: "2025-09-20" },
  // Ghost: exists in finance but not in ops
  { finance_id: "EQ-113", tag: "C0000113", site: "Lab-Building-A", book_value_usd: 1250000, status: "pending_receipt", capitalized_on: null },
];

// ---------------------------------------------------------------------------
// Mock createApiClient
// ---------------------------------------------------------------------------

vi.mock("@/lib/api-client", () => ({
  createApiClient: () => ({
    assets: { list: async () => OPS_ASSETS },
    mock: {
      facilities: async () => FAC_RECORDS,
      finance: async () => FIN_RECORDS,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildReconcileReport — join logic", () => {
  let report: Awaited<ReturnType<typeof buildReconcileReport>>;

  beforeEach(async () => {
    report = await buildReconcileReport();
  });

  // --- totals ---------------------------------------------------------------

  it("reports correct system totals", () => {
    expect(report.totals.ops).toBe(12);
    expect(report.totals.facilities).toBe(FAC_RECORDS.length);
    expect(report.totals.finance).toBe(FIN_RECORDS.length);
  });

  // --- expected gaps --------------------------------------------------------

  it("classifies stored assets as unaudited (no facilities record, not expected)", () => {
    const tags = report.unaudited.no_facilities_record.map(r => r.asset_tag);
    expect(tags).toContain("C0000104");
    expect(tags).toContain("C0000105");
    expect(tags).toContain("C0000112");
  });

  it("classifies received assets as unaudited (no facilities record, not expected)", () => {
    const tags = report.unaudited.no_facilities_record.map(r => r.asset_tag);
    expect(tags).toContain("C0000107");
  });

  it("does not put clean in_service assets in expected gaps", () => {
    const tags = report.expected.not_in_facilities.map(r => r.asset_tag);
    expect(tags).not.toContain("C0000101");
    expect(tags).not.toContain("C0000102");
    expect(tags).not.toContain("C0000106");
  });

  // --- real drift: ghosts ---------------------------------------------------

  it("detects ghost in facilities (tag in facilities but not in ops)", () => {
    const tags = report.real_drift.ghost_in_facilities.map(r => r.asset_tag);
    expect(tags).toContain("C0000199");
  });

  it("detects ghost in finance (tag in finance but not in ops)", () => {
    const tags = report.real_drift.ghost_in_finance.map(r => r.asset_tag);
    expect(tags).toContain("C0000113");
  });

  it("does not flag known ops assets as ghosts", () => {
    const facGhostTags = report.real_drift.ghost_in_facilities.map(r => r.asset_tag);
    const finGhostTags = report.real_drift.ghost_in_finance.map(r => r.asset_tag);
    // C0000109 is intentionally in ghost_in_finance (disposed but Finance still capitalized — should be retired)
    const opsTagsToCheck = OPS_ASSETS.map(a => a.asset_tag).filter(t => t !== "C0000109");
    for (const tag of opsTagsToCheck) {
      expect(facGhostTags).not.toContain(tag);
      expect(finGhostTags).not.toContain(tag);
    }
  });

  // --- real drift: location mismatch ----------------------------------------

  it("detects disposed asset still racked in facilities (C0000109) — ambiguous because fac scan is newer than ops", () => {
    // C0000109 fac last_observed 2026-03-15 > ops updated_at 2026-01-02 → facilities_newer_than_ops
    const tags = report.ambiguous.facilities_newer_than_ops.map(r => r.asset_tag);
    expect(tags).toContain("C0000109");
    const row = report.ambiguous.facilities_newer_than_ops.find(r => r.asset_tag === "C0000109")!;
    expect(row.detail).toMatch(/disposed/i);
  });

  it("detects rma_pending asset still racked in facilities (C0000108) — ambiguous because fac scan is newer than ops", () => {
    // C0000108 fac last_observed 2026-04-21 > ops updated_at 2026-01-02 → facilities_newer_than_ops
    const tags = report.ambiguous.facilities_newer_than_ops.map(r => r.asset_tag);
    expect(tags).toContain("C0000108");
    const row = report.ambiguous.facilities_newer_than_ops.find(r => r.asset_tag === "C0000108")!;
    expect(row.detail).toMatch(/repair/i);
  });

  it("detects rack unit mismatch for in_service asset (C0000110)", () => {
    const tags = report.real_drift.location_mismatch.map(r => r.asset_tag);
    expect(tags).toContain("C0000110");
    const row = report.real_drift.location_mismatch.find(r => r.asset_tag === "C0000110")!;
    expect(row.detail).toMatch(/slot/i);
  });

  it("does not flag clean in_service assets as location mismatch", () => {
    const tags = report.real_drift.location_mismatch.map(r => r.asset_tag);
    expect(tags).not.toContain("C0000101");
    expect(tags).not.toContain("C0000102");
    expect(tags).not.toContain("C0000103");
  });

  // --- ambiguous ------------------------------------------------------------

  it("detects stale facilities observation (C0000111)", () => {
    const tags = report.ambiguous.stale_observation.map(r => r.asset_tag);
    expect(tags).toContain("C0000111");
  });

  it("does not flag recently observed assets as stale", () => {
    const tags = report.ambiguous.stale_observation.map(r => r.asset_tag);
    // C0000101 last_observed 2026-05-08 — well within 90 days
    expect(tags).not.toContain("C0000101");
  });

  it("detects disposed asset still capitalized in finance (C0000109) — real drift, should be retired", () => {
    // disposed + capitalized = Finance hasn't retired it → real drift (ghost_in_finance)
    const tags = report.real_drift.ghost_in_finance.map(r => r.asset_tag);
    expect(tags).toContain("C0000109");
    const row = report.real_drift.ghost_in_finance.find(r => r.asset_tag === "C0000109")!;
    expect(row.detail).toMatch(/disposed/i);
  });

  it("detects rma_pending asset still capitalized in finance (C0000108)", () => {
    const tags = report.ambiguous.state_finance_conflict.map(r => r.asset_tag);
    expect(tags).toContain("C0000108");
    const row = report.ambiguous.state_finance_conflict.find(r => r.asset_tag === "C0000108")!;
    expect(row.detail).toMatch(/repair/i);
  });

  it("does not flag in_service capitalized assets as state/finance conflict", () => {
    const tags = report.ambiguous.state_finance_conflict.map(r => r.asset_tag);
    expect(tags).not.toContain("C0000101");
    expect(tags).not.toContain("C0000110");
  });

  // --- no double-counting ---------------------------------------------------

  it("does not put the same tag in both expected and real drift", () => {
    const expectedTags = new Set(report.expected.not_in_facilities.map(r => r.asset_tag));
    const driftTags = report.real_drift.location_mismatch.map(r => r.asset_tag);
    for (const tag of driftTags) {
      expect(expectedTags.has(tag)).toBe(false);
    }
  });

  it("stored/received assets with no facilities record land in unaudited, not expected or real drift", () => {
    const unauditedTags = new Set(report.unaudited.no_facilities_record.map(r => r.asset_tag));
    // C0000104, C0000105, C0000107, C0000112 are stored/received with no facilities scan
    expect(unauditedTags.has("C0000104")).toBe(true);
    expect(unauditedTags.has("C0000105")).toBe(true);
    expect(unauditedTags.has("C0000107")).toBe(true);
    expect(unauditedTags.has("C0000112")).toBe(true);
    // Must NOT appear in expected or real drift
    const driftTags = new Set(report.real_drift.location_mismatch.map(r => r.asset_tag));
    const expectedTags = new Set(report.expected.not_in_facilities.map(r => r.asset_tag));
    for (const tag of ["C0000104", "C0000105", "C0000107", "C0000112"]) {
      expect(driftTags.has(tag)).toBe(false);
      expect(expectedTags.has(tag)).toBe(false);
    }
  });
});
