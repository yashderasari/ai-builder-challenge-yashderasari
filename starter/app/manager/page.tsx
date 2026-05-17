"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Asset } from "@/lib/types";
import type { ReconcileReport } from "@/lib/reconcile";
import { StateBadge } from "@/components/StateBadge";
import { formatLocation, relativeTime } from "@/lib/format";

const PAGE_SIZE = 25;

function buildIssueSet(report: ReconcileReport): Set<string> {
  const tags = new Set<string>();
  const addAll = (rows: { asset_tag: string }[]) => rows.forEach(r => tags.add(r.asset_tag));
  addAll(report.real_drift.location_mismatch);
  addAll(report.real_drift.ghost_in_facilities);
  addAll(report.real_drift.ghost_in_finance);
  addAll(report.ambiguous.missing_from_facilities);
  addAll(report.ambiguous.state_finance_conflict);
  addAll(report.ambiguous.stale_observation);
  addAll(report.ambiguous.facilities_newer_than_ops);
  addAll(report.unaudited.no_facilities_record);
  addAll(report.unaudited.no_finance_record);
  addAll(report.expected.not_in_facilities);
  addAll(report.expected.not_in_finance);
  return tags;
}

function lastAction(state: string): string {
  switch (state) {
    case "in_service": return "Deployed to rack";
    default:           return "";
  }
}

function ManagerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [issueSet, setIssueSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const siteFilter = searchParams.get("site") ?? "";
  const search = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  function updateParams(updates: Record<string, string>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const setSiteFilter = (v: string) => updateParams({ site: v, page: "" });
  const setSearch = (v: string) => updateParams({ q: v, page: "" });
  const setPage = (v: number) => updateParams({ page: v === 1 ? "" : String(v) });

  useEffect(() => {
    Promise.all([
      api.assets.list(),
      fetch("/api/reconcile", { cache: "no-store" }).then(r => r.ok ? r.json() as Promise<ReconcileReport> : null),
    ])
      .then(([assetList, report]) => {
        setAssets(assetList);
        if (report) setIssueSet(buildIssueSet(report));
      })
      .catch(() => setError("Could not load assets. Is the API running?"))
      .finally(() => setLoading(false));
  }, []);

  const sites = useMemo(() => {
    const s = new Set(assets.map(a => a.location.site).filter(Boolean));
    return Array.from(s).sort();
  }, [assets]);

  // Only in_service assets not flagged in any reconcile bucket
  const verified = useMemo(() => {
    return assets.filter(a => a.state === "in_service" && !issueSet.has(a.asset_tag));
  }, [assets, issueSet]);

  const filtered = useMemo(() => {
    return verified
      .filter(a => !siteFilter || a.location.site === siteFilter)
      .filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          a.asset_tag.toLowerCase().includes(q) ||
          a.serial.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q) ||
          a.manufacturer.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [verified, siteFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function clearFilters() {
    router.replace("?", { scroll: false });
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-40 bg-gray-100 rounded-lg" />
        </div>
        <div className="h-10 rounded-lg bg-gray-100" />
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-gray-50 border-b h-10" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <div className="w-24 h-4 bg-gray-200 rounded" />
              <div className="flex-1 h-4 bg-gray-100 rounded" />
              <div className="w-20 h-6 bg-gray-100 rounded-full" />
              <div className="flex-1 h-4 bg-gray-100 rounded hidden md:block" />
              <div className="w-20 h-4 bg-gray-100 rounded hidden md:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {verified.length} assets verified across Ops · Facilities · Finance
          </p>
        </div>
        <Link
          href="/manager/reconcile"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          Reconciliation report →
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 w-full">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by tag, serial, model…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none flex-1 min-w-0"
        />
        {sites.length > 0 && (
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none bg-white"
          >
            <option value="">All sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(siteFilter || search) && (
          <button onClick={clearFilters} className="shrink-0 text-sm text-gray-500 hover:text-gray-800 underline">
            Clear
          </button>
        )}
        <span className="shrink-0 text-sm text-gray-400">
          {filtered.length.toLocaleString()} asset{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">No assets match your filters.</p>
          <button onClick={clearFilters} className="mt-2 text-sm text-blue-600 hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tag</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Model</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">State</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Location</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Custodian</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(asset => (
                <tr key={asset.asset_tag} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/manager/assets/${asset.asset_tag}`} className="font-mono text-blue-600 hover:underline">
                      {asset.asset_tag}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">{lastAction(asset.state)}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-800">
                    <p>{asset.model}</p>
                    <p className="text-xs text-gray-400">{asset.manufacturer}</p>
                  </td>
                  <td className="px-4 py-3"><StateBadge state={asset.state} /></td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{formatLocation(asset.location) || "—"}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{asset.custodian}</td>
                  <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{relativeTime(asset.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-gray-500">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function ManagerPage() {
  return (
    <Suspense fallback={<div className="space-y-6 max-w-5xl animate-pulse"><div className="h-8 w-32 bg-gray-100 rounded" /><div className="h-24 bg-gray-100 rounded-lg" /></div>}>
      <ManagerContent />
    </Suspense>
  );
}
