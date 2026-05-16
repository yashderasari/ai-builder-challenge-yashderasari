"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import type { ReconcileRow } from "@/lib/reconcile";

const PAGE_SIZE = 25;

type Props = {
  notInFacilities: ReconcileRow[];
  notInFinance: ReconcileRow[];
};

export function ExpectedGapsTable({ notInFacilities, notInFinance }: Props) {
  const allRows = useMemo(() => [
    ...notInFacilities.map(r => ({ ...r, bucket: "Not tracked by facilities" as const })),
    ...notInFinance.map(r => ({ ...r, bucket: "Not yet in finance" as const })),
  ], [notInFacilities, notInFinance]);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(r =>
      r.asset_tag.toLowerCase().includes(q) ||
      (r.ops?.model ?? "").toLowerCase().includes(q) ||
      (r.ops?.manufacturer ?? "").toLowerCase().includes(q) ||
      r.detail.toLowerCase().includes(q) ||
      r.bucket.toLowerCase().includes(q)
    );
  }, [allRows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-700">Expected gaps — not a problem</h2>
          <p className="text-sm text-gray-400 mt-0.5">These differences are by design. No action needed.</p>
        </div>
        <span className="shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-gray-100 text-gray-500">
          {allRows.length}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by tag, model, reason…"
          className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
        />
        <span className="shrink-0 text-xs text-gray-400">
          {filtered.length.toLocaleString()} gap{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Tag</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Asset</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Last ops activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No gaps match your search.
                </td>
              </tr>
            ) : visible.map(row => (
              <tr key={`${row.asset_tag}-${row.bucket}`} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/manager/assets/${row.asset_tag}`} className="font-mono text-blue-600 hover:underline">
                    {row.asset_tag}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {row.ops ? `${row.ops.manufacturer} ${row.ops.model}` : "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{row.detail}</td>
                <td className="px-4 py-2.5 text-gray-400">{row.bucket}</td>
                <td className="px-4 py-2.5 text-gray-400 font-mono">
                  {row.ops?.updated_at ? relativeTime(row.ops.updated_at) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
