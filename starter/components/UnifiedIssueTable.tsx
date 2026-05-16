"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/format";

export type SystemFlag = "ok" | "alert" | "none";
export type IssueSeverity = "real" | "ambiguous";

export type IssueSystem = "ops" | "facilities" | "finance";

export type UnifiedRow = {
  asset_tag: string;
  model: string;
  manufacturer: string;
  ops: SystemFlag;
  facilities: SystemFlag;
  finance: SystemFlag;
  severity: IssueSeverity;
  issues: { text: string; severity: IssueSeverity; systems: IssueSystem[] }[];
  timestamps: { ops?: string; facilities?: string; finance?: string };
  location?: string;
  custodian?: string;
};

type SystemFilter = "all" | "ops" | "facilities" | "finance";
type SortKey = "tag" | "model" | "ops" | "facilities" | "finance" | "last_seen" | "issues";
type SortDir = "asc" | "desc";

const FLAG_ORDER: Record<SystemFlag, number> = { alert: 0, ok: 1, none: 2 };

function mostRecentTimestamp(ts: UnifiedRow["timestamps"]): number {
  const vals = [ts.ops, ts.facilities, ts.finance].filter(Boolean) as string[];
  if (!vals.length) return 0;
  return Math.max(...vals.map(v => new Date(v).getTime()));
}

function sortRows(rows: UnifiedRow[], key: SortKey, dir: SortDir): UnifiedRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "tag")       cmp = a.asset_tag.localeCompare(b.asset_tag);
    else if (key === "model")      cmp = a.model.localeCompare(b.model);
    else if (key === "ops")        cmp = FLAG_ORDER[a.ops] - FLAG_ORDER[b.ops];
    else if (key === "facilities") cmp = FLAG_ORDER[a.facilities] - FLAG_ORDER[b.facilities];
    else if (key === "finance")    cmp = FLAG_ORDER[a.finance] - FLAG_ORDER[b.finance];
    else if (key === "last_seen")  cmp = mostRecentTimestamp(b.timestamps) - mostRecentTimestamp(a.timestamps);
    else if (key === "issues")     cmp = b.issues.length - a.issues.length;
    return cmp * factor;
  });
}

function SystemCell({ flag, severity }: { flag: SystemFlag; severity: IssueSeverity }) {
  if (flag === "none") return <span className="text-gray-300 font-medium">—</span>;
  if (flag === "ok") return <span className="text-green-500 text-base">✓</span>;
  const color = severity === "real" ? "text-red-500" : "text-amber-500";
  return <span className={`text-base font-bold ${color}`} title="Issue detected">⚠</span>;
}

function getIssueExplanation(text: string): string | null {
  if (text.startsWith("Location conflict")) {
    return "Operations and Facilities agree this asset is racked, but disagree on where. Someone moved it without scanning. Send a tech to verify the actual location and rescan.";
  }
  if (text === "Disposed in Operations — Facilities still shows it as racked" || text === "Removed from Operations — Facilities wasn't updated") {
    return "Operations shows this asset as stored, out for repair, or disposed — but Facilities still has it at a rack position. The de-rack scan was missed. Facilities needs to remove the record; no physical move required.";
  }
  if (text === "Facilities has a record — Operations doesn't") {
    return "Facilities has a rack record for this tag, but Operations has never seen it. Could be an unscanned disposal, a data entry error, or a legacy asset. Investigate with the Facilities team before taking action.";
  }
  if (text === "Finance has a record — Operations doesn't") {
    return "Finance has a purchase record for this tag, but Operations has never seen it. Could be a new delivery not yet received, or a manual entry error. Investigate with Finance before taking action.";
  }
  if (text === "Active in Operations — no Facilities scan on record") {
    return "Operations shows this asset as deployed and in use, but Facilities has no rack entry. May be a deploy scan that didn't write through. If it's physically racked, a tech can rescan to create the record.";
  }
  if (text.startsWith("Facilities last scanned")) {
    return "Facilities hasn't logged this asset in over 90 days, but Operations shows it as active. It may still be in place and just not scanned recently, or it may have moved. Have a tech verify and rescan to refresh the record.";
  }
  if (text.startsWith("Marked disposed") || text.startsWith("Out for repair — Finance")) {
    return "Operations has marked this asset as disposed or out for repair, but Finance still carries it as active. No field action needed — Finance should close or adjust the record on their end.";
  }
  return null;
}

function IssueWithTooltip({ issue }: { issue: { text: string; severity: "real" | "ambiguous" } }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const explanation = getIssueExplanation(issue.text);

  return (
    <span
      className="relative inline"
      onMouseEnter={e => explanation && setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <span className={explanation ? "cursor-help border-b border-dashed border-gray-300" : ""}>
        {issue.text}
      </span>
      {pos && explanation && (
        <div
          className="fixed z-[9999] w-64 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-xs text-gray-600 leading-relaxed pointer-events-none"
          style={{ top: pos.y + 12, left: pos.x }}
        >
          <p className={`font-medium mb-1 ${issue.severity === "real" ? "text-red-600" : "text-amber-600"}`}>
            {issue.severity === "real" ? "Action needed" : "Needs review"}
          </p>
          {explanation}
        </div>
      )}
    </span>
  );
}

function TagWithTooltip({ row }: { row: UnifiedRow }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="inline-block"
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <Link
        href={`/manager/assets/${row.asset_tag}`}
        className="font-mono text-blue-600 hover:underline font-semibold"
      >
        {row.asset_tag}
      </Link>
      {pos && (
        <div
          className="fixed z-[9999] w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-xs space-y-1.5 pointer-events-none"
          style={{ top: pos.y + 12, left: pos.x }}
        >
          {row.location || row.custodian ? (
            <>
              {row.location && (
                <div>
                  <span className="text-gray-400 block">Location</span>
                  <span className="text-gray-700 font-medium">{row.location}</span>
                </div>
              )}
              {row.custodian && (
                <div>
                  <span className="text-gray-400 block">Custodian</span>
                  <span className="text-gray-700 font-medium">{row.custodian}</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-gray-400 italic">Click for more info</span>
          )}
        </div>
      )}
    </div>
  );
}

function TableContent({ rows, filter, expanded, search, sortKey, sortDir, onSort }: {
  rows: UnifiedRow[];
  filter: SystemFilter;
  expanded: boolean;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const filtered = sortRows(
    rows.filter(row => {
      if (filter !== "all" && !row.issues.some(issue => issue.systems.includes(filter as IssueSystem))) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          row.asset_tag.toLowerCase().includes(q) ||
          row.model.toLowerCase().includes(q) ||
          row.manufacturer.toLowerCase().includes(q) ||
          row.issues.some(i => i.text.toLowerCase().includes(q))
        );
      }
      return true;
    }),
    sortKey,
    sortDir,
  );

  function SortTh({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap ${className ?? "text-left"}`}
        onClick={() => onSort(col)}
      >
        {label}
        {active && (
          <span className="ml-1 text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </th>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <SortTh col="tag" label="Tag" />
          <SortTh col="model" label="Model" />
          <SortTh col="ops" label="Ops" className="text-center px-3 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" />
          <SortTh col="facilities" label="Facilities" className="text-center px-3 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" />
          <SortTh col="finance" label="Finance" className="text-center px-3 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900" />
          <SortTh col="last_seen" label="Last seen" />
          <SortTh col="issues" label="Issues" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
              No issues in this system.
            </td>
          </tr>
        ) : filtered.map(row => (
          <tr
            key={row.asset_tag}
            className="hover:bg-gray-50"
          >
            <td className="px-4 py-3">
              <TagWithTooltip row={row} />
              <p className="text-xs text-gray-400 mt-0.5">
                {row.severity === "real"
                  ? <span className="text-red-600 font-medium">Action needed</span>
                  : <span className="text-amber-600 font-medium">Needs review</span>
                }
              </p>
            </td>
            <td className="px-4 py-3">
              <p className="text-gray-800">{row.model || "—"}</p>
              {row.manufacturer && <p className="text-xs text-gray-400">{row.manufacturer}</p>}
            </td>
            <td className="px-3 py-3 text-center">
              <SystemCell flag={row.ops} severity={row.severity} />
            </td>
            <td className="px-3 py-3 text-center">
              <SystemCell flag={row.facilities} severity={row.severity} />
            </td>
            <td className="px-3 py-3 text-center">
              <SystemCell flag={row.finance} severity={row.severity} />
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
              <div className="flex flex-col gap-0.5 text-xs text-gray-500">
                {row.timestamps.ops && (
                  <span><span className="text-gray-400 font-sans">Ops</span> <span className="font-mono">{relativeTime(row.timestamps.ops!)}</span></span>
                )}
                {row.timestamps.facilities && (
                  <span><span className="text-gray-400 font-sans">Fac</span> <span className="font-mono">{relativeTime(row.timestamps.facilities!)}</span></span>
                )}
                {row.timestamps.finance && (
                  <span><span className="text-gray-400 font-sans">Fin</span> <span className="font-mono">{relativeTime(row.timestamps.finance!)}</span></span>
                )}
              </div>
            </td>
            <td className="px-4 py-3">
              <ul className="space-y-1">
                {row.issues.map((issue, i) => (
                    <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                      <span className={`mt-0.5 shrink-0 ${issue.severity === "real" ? "text-red-400" : "text-amber-400"}`}>⚠</span>
                      <IssueWithTooltip issue={issue} />
                    </li>
                  ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UnifiedIssueTableInner({ rows }: { rows: UnifiedRow[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filter = (searchParams.get("rf") ?? "all") as SystemFilter;
  const search = searchParams.get("rq") ?? "";
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("issues");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function updateParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") p.set(key, value); else p.delete(key);
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const setFilter = (f: SystemFilter) => updateParam("rf", f);
  const setSearch = (q: string) => updateParam("rq", q);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rowMatchesFilter = (row: UnifiedRow, f: SystemFilter) =>
    f === "all" || row.issues.some(issue => issue.systems.includes(f as IssueSystem));

  const rowMatchesSearch = (row: UnifiedRow, q: string) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return (
      row.asset_tag.toLowerCase().includes(lower) ||
      row.model.toLowerCase().includes(lower) ||
      row.manufacturer.toLowerCase().includes(lower) ||
      row.issues.some(i => i.text.toLowerCase().includes(lower))
    );
  };

  const filterButtons: { key: SystemFilter; label: string }[] = [
    { key: "all", label: `All (${rows.length})` },
    { key: "ops", label: `Ops (${rows.filter(r => rowMatchesFilter(r, "ops")).length})` },
    { key: "facilities", label: `Facilities (${rows.filter(r => rowMatchesFilter(r, "facilities")).length})` },
    { key: "finance", label: `Finance (${rows.filter(r => rowMatchesFilter(r, "finance")).length})` },
  ];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
        <strong>No issues found.</strong> All three systems agree on every asset.
      </div>
    );
  }

  const controls = (
    <div className="flex items-center gap-3 w-full">
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by tag, model, issue…"
        className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
      />
      <div className="flex items-center gap-2 shrink-0 text-xs">
        <label className="text-gray-500 font-medium" htmlFor="system-filter">Filter by system</label>
        <select
          id="system-filter"
          value={filter}
          onChange={e => setFilter(e.target.value as SystemFilter)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          {filterButtons.map(btn => (
            <option key={btn.key} value={btn.key}>{btn.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
        <span><span className="text-red-500 font-bold">⚠</span> real drift</span>
        <span><span className="text-amber-500 font-bold">⚠</span> review</span>
        <span><span className="text-gray-300 font-medium">—</span> no record</span>
      </div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        {expanded ? "⊠ Collapse" : "⊞ Expand"}
      </button>
    </div>
  );

  if (expanded) {
    return (
      <>
        <div className="space-y-3">{controls}</div>
        {/* Full-viewport overlay */}
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center gap-3 px-6 py-3 border-b bg-gray-50">
            <span className="shrink-0 font-semibold text-gray-800 text-sm">Assets with issues</span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by tag, model, issue…"
              className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <label className="text-gray-500 font-medium" htmlFor="system-filter-expanded">Filter</label>
              <select
                id="system-filter-expanded"
                value={filter}
                onChange={e => setFilter(e.target.value as SystemFilter)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                {filterButtons.map(btn => (
                  <option key={btn.key} value={btn.key}>{btn.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              ⊠ Collapse
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="rounded-none border-0">
              <TableContent rows={rows} filter={filter} expanded={expanded} search={search} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {controls}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <TableContent rows={rows} filter={filter} expanded={expanded} search={search} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        </div>
      </div>
    </div>
  );
}

export function UnifiedIssueTable({ rows }: { rows: UnifiedRow[] }) {
  return (
    <Suspense fallback={<div className="animate-pulse h-48 rounded-lg bg-gray-100" />}>
      <UnifiedIssueTableInner rows={rows} />
    </Suspense>
  );
}
