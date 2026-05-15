"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { Asset, AssetState } from "@/lib/types";
import { StateBadge } from "@/components/StateBadge";
import { STATE_LABELS, formatLocation, relativeTime } from "@/lib/format";

const PAGE_SIZE = 25;

const STATES: AssetState[] = ["received", "stored", "in_service", "rma_pending", "disposed", "unreceived"];

export default function ManagerPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [search, setSearch] = useState("");
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

  const filtered = useMemo(() => {
    return assets
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
  }, [assets, stateFilter, siteFilter, search]);

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
        <Link href="/manager/reconcile" className="text-sm text-blue-600 hover:underline">
          Reconciliation report →
        </Link>
      </div>

      {/* Needs-attention strip */}
      {(recentActivity > 0 || rmaPending > 0) && (
        <div className="flex flex-wrap gap-3">
          {recentActivity > 0 && (
            <button
              onClick={() => { setPage(1); }}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 hover:bg-blue-100"
            >
              <span className="font-semibold">{recentActivity}</span> asset{recentActivity !== 1 ? "s" : ""} updated in the last 24 hours
            </button>
          )}
          {rmaPending > 0 && (
            <button
              onClick={() => { setStateFilter("rma_pending"); setPage(1); }}
              className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-800 hover:bg-orange-100"
            >
              <span className="font-semibold">{rmaPending}</span> RMA pending
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by tag, serial, model…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none w-64"
        />
        <select
          value={stateFilter}
          onChange={e => { setStateFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none bg-white"
        >
          <option value="">All states</option>
          {STATES.map(s => <option key={s} value={s}>{STATE_LABELS[s]}</option>)}
        </select>
        {sites.length > 0 && (
          <select
            value={siteFilter}
            onChange={e => { setSiteFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none bg-white"
          >
            <option value="">All sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(stateFilter || siteFilter || search) && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-800 underline">
            Clear filters
          </button>
        )}
        <span className="text-sm text-gray-400 ml-auto">
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
