"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Asset, AssetState } from "@/lib/types";
import { StateBadge } from "@/components/StateBadge";
import { STATE_LABELS, formatLocation, relativeTime } from "@/lib/format";

const PAGE_SIZE = 25;

function lastAction(state: string): string {
  switch (state) {
    case "received":     return "Received at dock";
    case "stored":       return "Moved to storage";
    case "in_service":   return "Deployed to rack";
    case "rma_pending":  return "Sent for RMA";
    case "disposed":     return "Disposed";
    case "unreceived":   return "Not yet received";
    default:             return "";
  }
}

const STATES: AssetState[] = ["received", "stored", "in_service", "rma_pending", "disposed", "unreceived"];

export default function ManagerPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.assets.list()
      .then(setAssets)
      .catch(() => setError("Could not load assets. Is the API running?"))
      .finally(() => setLoading(false));
  }, []);

  const sites = useMemo(() => {
    const s = new Set(assets.map(a => a.location.site).filter(Boolean));
    return Array.from(s).sort();
  }, [assets]);

  const stateCounts = useMemo(() => {
    const counts: Partial<Record<AssetState, number>> = {};
    for (const a of assets) {
      counts[a.state] = (counts[a.state] ?? 0) + 1;
    }
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    return assets
      .filter(a => !recentOnly || Date.now() - new Date(a.updated_at).getTime() < 86_400_000)
      .filter(a => !stateFilter || a.state === stateFilter)
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
  }, [assets, stateFilter, siteFilter, search, recentOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Needs-attention: assets last updated within 24h or in unusual states
  const recentActivity = assets
    .filter(a => Date.now() - new Date(a.updated_at).getTime() < 86_400_000)
    .length;
  const rmaPending = assets.filter(a => a.state === "rma_pending").length;

  function clearFilters() {
    setStateFilter("");
    setSiteFilter("");
    setSearch("");
    setRecentOnly(false);
    setPage(1);
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <h1 className="text-2xl font-bold">Assets</h1>
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-100" />)}
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
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assets</h1>
        <Link
          href="/manager/reconcile"
          className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          Reconciliation report →
        </Link>
      </div>

      {/* Fleet health — state breakdown, clickable to filter */}
      {assets.length > 0 && (
        <div className="flex gap-2 w-full">
          {(["in_service", "stored", "received", "rma_pending", "disposed", "unreceived"] as AssetState[]).map(state => {
            const count = stateCounts[state] ?? 0;
            if (count === 0) return null;
            const active = stateFilter === state;
            const highlight: Record<AssetState, string> = {
              in_service:  active ? "border-green-400 bg-green-100 text-green-900" : "border-green-100 bg-green-50 text-green-800",
              stored:      active ? "border-yellow-400 bg-yellow-100 text-yellow-900" : "border-yellow-100 bg-yellow-50 text-yellow-800",
              received:    active ? "border-blue-400 bg-blue-100 text-blue-900" : "border-blue-100 bg-blue-50 text-blue-800",
              rma_pending: active ? "border-orange-400 bg-orange-100 text-orange-900" : "border-orange-100 bg-orange-50 text-orange-800",
              disposed:    active ? "border-red-400 bg-red-100 text-red-900" : "border-red-100 bg-red-50 text-red-800",
              unreceived:  active ? "border-gray-400 bg-gray-100 text-gray-900" : "border-gray-100 bg-gray-50 text-gray-700",
            };
            return (
              <button
                key={state}
                onClick={() => { setStateFilter(f => f === state ? "" : state); setPage(1); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-center hover:opacity-80 transition-opacity ${highlight[state]}`}
              >
                <p className="text-lg font-bold leading-none">{count}</p>
                <p className="text-xs mt-1 opacity-80">{STATE_LABELS[state]}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters + attention strip — full width to match table */}
      <div className="flex items-center gap-3 w-full">
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by tag, serial, model…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none flex-1 min-w-0"
        />
        {recentActivity > 0 && (
          <button
            onClick={() => { setRecentOnly(r => !r); setPage(1); }}
            className={`shrink-0 rounded-lg border px-4 py-2 text-sm whitespace-nowrap hover:bg-slate-100 ${recentOnly ? "bg-slate-100 border-slate-400 text-slate-900 font-medium" : "border-slate-200 bg-slate-50 text-slate-700"}`}
          >
            <span className="font-semibold">{recentActivity}</span> asset{recentActivity !== 1 ? "s" : ""} updated in the last 24 hours
          </button>
        )}
        {sites.length > 0 && (
          <select
            value={siteFilter}
            onChange={e => { setSiteFilter(e.target.value); setPage(1); }}
            className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none bg-white"
          >
            <option value="">All sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(stateFilter || siteFilter || search || recentOnly) && (
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
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-gray-500">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
