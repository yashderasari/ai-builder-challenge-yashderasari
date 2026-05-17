"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { relativeTime } from "@/lib/format";

export type SystemFlag = "ok" | "alert" | "none";
export type IssueSeverity = "real" | "ambiguous" | "unaudited" | "expected";
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
type SortKey = "tag" | "model" | "ops" | "facilities" | "finance" | "last_seen" | "issues" | "severity";
type SortDir = "asc" | "desc";

const FLAG_ORDER: Record<SystemFlag, number> = { alert: 0, ok: 1, none: 2 };

// Design-exact system palette
const SYS = {
  ops:        { bg100: '#dde8ff', bg50: '#eef4ff', text700: '#1e4aa8', text600: '#2f5fc7', border300: '#7ea2ee' },
  facilities: { bg100: '#ecdcf6', bg50: '#f6eefb', text700: '#6f2f95', text600: '#8a3fb6', border300: '#b88ad3' },
  finance:    { bg100: '#d3ecdc', bg50: '#e9f6ee', text700: '#1e6f44', text600: '#2f8c5a', border300: '#79b896' },
} as const;

// "Operations" / "Facilities" / "Finance" → sys key for inline chips
const WORD_TO_SYS: Record<string, IssueSystem> = {
  Operations: "ops",
  Facilities: "facilities",
  Finance:    "finance",
};

function renderIssueText(text: string) {
  return text.split(/(Operations|Facilities|Finance)/).map((part, i) => {
    const sys = WORD_TO_SYS[part];
    if (sys) {
      return (
        <span
          key={i}
          style={{
            background: SYS[sys].bg100,
            color: SYS[sys].text700,
            padding: "0 5px",
            borderRadius: "3px",
            fontWeight: 600,
            display: "inline",
          }}
        >
          {part}
        </span>
      );
    }
    return part;
  });
}


function SystemCell({ flag, severity }: { flag: SystemFlag; severity: IssueSeverity }) {
  if (flag === "none") return <span className="text-gray-300 font-medium">—</span>;
  if (flag === "ok") return <span className="text-green-500 text-base">✓</span>;
  const color = severity === "real" ? "text-red-500" : severity === "ambiguous" ? "text-amber-500" : "text-slate-400";
  return <span className={`text-base font-bold ${color}`} title="Issue detected">⚠</span>;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { real: 0, ambiguous: 1, unaudited: 2, expected: 3 };

function SeverityLabel({ severity }: { severity: IssueSeverity }) {
  if (severity === "real")      return <span className="text-red-600 font-medium">Action needed</span>;
  if (severity === "ambiguous") return <span className="text-amber-600 font-medium">Needs review</span>;
  if (severity === "unaudited") return <span className="text-slate-500 font-medium">Unaudited</span>;
  return <span className="text-gray-400 font-medium">Expected</span>;
}

function IssueDot({ severity }: { severity: IssueSeverity }) {
  if (severity === "real")      return <span className="text-red-400 font-bold shrink-0 mt-0.5">⚠</span>;
  if (severity === "ambiguous") return <span className="text-amber-400 font-bold shrink-0 mt-0.5">⚠</span>;
  if (severity === "unaudited") return <span className="text-slate-400 font-bold shrink-0 mt-0.5">·</span>;
  return <span className="text-gray-300 font-bold shrink-0 mt-0.5">·</span>;
}

function getIssueExplanation(text: string): string[] | null {
  if (text.startsWith("Location conflict"))
    return [
      "Maybe the asset was moved to a different rack without a rescan",
      "Maybe one system has a data entry error on the rack or slot",
      "Send a tech to verify the physical location and rescan to correct both systems",
    ];
  if (text === "Disposed in Operations — Facilities still shows it as racked" || text === "Removed from Operations — Facilities wasn't updated")
    return [
      "Maybe the de-rack scan was missed when the asset was removed",
      "Maybe the state change in Ops was recorded before the physical move happened",
      "No physical action needed — ask Facilities to remove the rack record",
    ];
  if (text === "Physically racked with no record in Operations or Finance — untracked asset with no procurement or intake history")
    return [
      "Maybe the asset was deployed completely off-books without a receive scan or PO",
      "Maybe Facilities mis-scanned a tag that belongs to a different asset",
      "Go to the rack position Facilities recorded and verify what is physically there",
    ];
  if (text === "Physically racked but never received into Operations — Finance raised a PO but the receive scan was skipped")
    return [
      "Maybe someone bypassed the intake step and deployed directly from the dock",
      "Maybe the receive scan was done on the wrong tag",
      "Formally receive this asset in Operations to establish its audit trail",
    ];
  if (text === "Physically racked with no Operations record — Finance has it capitalized but Ops has never seen it")
    return [
      "Maybe the asset was deployed without going through the Ops intake process",
      "Maybe it was received under a different tag and retagged without an update",
      "Investigate how it reached the rack without an Ops record, then create one",
    ];
  if (text === "Facilities has a record — Operations doesn't")
    return [
      "Maybe the asset was disposed or decommissioned without a proper Ops scan",
      "Maybe it's a legacy asset that predates the current tracking system",
      "Maybe Facilities mis-scanned a tag — verify with the Facilities team before acting",
    ];
  if (text === "No Finance record — asset is physically on-premises in Operations but Finance has no procurement entry")
    return [
      "Maybe the asset was received without a PO or the PO was raised under a different tag",
      "Maybe Finance entry was created but linked to the wrong asset tag",
      "Hardware is physically present with no paper trail — Finance must investigate and create a record",
    ];
  if (text === "Finance has a record — Operations doesn't")
    return [
      "Maybe the delivery hasn't been received into Ops yet",
      "Maybe the PO was raised for an asset that was never actually delivered",
      "Maybe it was manually entered in Finance without going through intake — verify with Finance",
    ];
  if (text === "Active in Operations — no Facilities scan on record")
    return [
      "Maybe the deploy scan didn't write through to Facilities",
      "Maybe the asset is racked but was never scanned by the Facilities team",
      "Send a tech to physically verify and rescan to create the Facilities record",
    ];
  if (text.startsWith("Stored in Operations") || text.startsWith("In receiving"))
    return [
      "Maybe the asset is physically present but Facilities only audits racked equipment",
      "Maybe it was moved internally without a system update",
      "No Facilities audit is possible until the asset is deployed to a rack",
    ];
  if (text.startsWith("Facilities last scanned"))
    return [
      "Maybe the asset is still in place and just hasn't been scanned recently",
      "Maybe it was moved or removed without a rescan",
      "Have a tech verify the rack position and rescan to refresh the Facilities record",
    ];
  if (text === "Disposed in Operations — Finance still shows it as active, should be retired")
    return [
      "Maybe Finance wasn't notified when the asset was disposed",
      "Maybe the disposal was recorded in Ops but the Finance write-off was never processed",
      "No field action needed — Finance must retire this asset to close the books",
    ];
  if (text === "Out for repair — Finance has already retired it, but Operations expects it back")
    return [
      "Maybe Finance prematurely wrote off the asset before the RMA outcome was known",
      "Maybe the wrong asset tag was retired in Finance",
      "Finance and Ops need to align — if the asset is returning, Finance must reverse the retirement",
    ];
  if (text === "Disposed in Operations — Finance marked it impaired but has not retired it yet" ||
      text === "Out for repair — Finance still shows it as active, should be marked impaired")
    return [
      "Maybe Finance hasn't processed the status update from Operations yet",
      "Maybe the notification between systems was missed or delayed",
      "No field action needed — ask Finance to update the record to reflect current state",
    ];
  if (text.startsWith("Latest Facilities scan conflicts with last Ops update — disposed"))
    return [
      "Maybe the disposal was recorded against the wrong asset tag",
      "Maybe Facilities mis-scanned a neighboring asset at that rack position",
      "A disposed asset cannot physically be racked — send a tech to verify immediately",
    ];
  if (text.startsWith("Latest Facilities scan conflicts with last Ops update"))
    return [
      "Maybe the asset returned from RMA and was re-racked without an Ops scan",
      "Maybe Facilities mis-scanned a neighboring asset",
      "Send a tech to verify the rack position — if it's there, scan it back into Ops",
    ];
  return null;
}

function IssueWithTooltip({ issue }: { issue: { text: string; severity: IssueSeverity; systems: IssueSystem[] } }) {
  const [pos, setPos] = useState<{ x: number; y: number; flipY: boolean; flipX: boolean } | null>(null);
  const bullets = getIssueExplanation(issue.text);

  return (
    <span
      className="relative inline"
      onMouseEnter={e => {
        if (!bullets) return;
        setPos({
          x: e.clientX,
          y: e.clientY,
          flipY: e.clientY > window.innerHeight - 200,
          flipX: e.clientX > window.innerWidth - 310,
        });
      }}
      onMouseLeave={() => setPos(null)}
    >
      <span className={bullets ? "cursor-help border-b border-dashed border-gray-300" : ""}>
        {renderIssueText(issue.text)}
      </span>
      {pos && bullets && (
        <div
          className="fixed z-[9999] w-72 rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-xs text-gray-600 leading-relaxed pointer-events-none"
          style={{
            top:    pos.flipY ? undefined : pos.y + 12,
            bottom: pos.flipY ? window.innerHeight - pos.y + 8 : undefined,
            left:   pos.flipX ? undefined : pos.x,
            right:  pos.flipX ? window.innerWidth - pos.x : undefined,
          }}
        >
          <p className={`font-medium mb-2 ${issue.severity === "real" ? "text-red-600" : "text-amber-600"}`}>
            {bullets ? "Possible explanations" : issue.severity === "real" ? "Action needed" : "Needs review"}
          </p>
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-0.5 text-gray-300 shrink-0">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}

function TagWithTooltip({ row }: { row: UnifiedRow }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const backParam = searchParams.toString() ? `?from=${encodeURIComponent(searchParams.toString())}` : "";

  return (
    <div
      ref={ref}
      className="inline-block"
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <Link href={`/manager/assets/${row.asset_tag}${backParam}`} className="font-mono text-blue-600 hover:underline font-semibold">
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

const PAGE_SIZE = 10;

function TableContent({ rows, filter, expanded, search, sortKey, sortDir, page, onSort, onSlice, onPage }: {
  rows: UnifiedRow[];
  filter: SystemFilter;
  expanded: boolean;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  page: number;
  onSort: (key: SortKey) => void;
  onSlice: (sys: SystemFilter) => void;
  onPage: (p: number) => void;
}) {
  const filtered = (() => {
    const base = rows.filter(row => {
      if (filter !== "all" && !row.issues.some(i => i.systems.includes(filter as IssueSystem))) return false;
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
    });
    const factor = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "tag")         cmp = a.asset_tag.localeCompare(b.asset_tag);
      else if (sortKey === "model")       cmp = a.model.localeCompare(b.model);
      else if (sortKey === "ops")         cmp = FLAG_ORDER[a.ops] - FLAG_ORDER[b.ops];
      else if (sortKey === "facilities")  cmp = FLAG_ORDER[a.facilities] - FLAG_ORDER[b.facilities];
      else if (sortKey === "finance")     cmp = FLAG_ORDER[a.finance] - FLAG_ORDER[b.finance];
      else if (sortKey === "last_seen") {
        const ts = (row: UnifiedRow) => {
          const vals = [row.timestamps.ops, row.timestamps.facilities, row.timestamps.finance].filter(Boolean) as string[];
          return vals.length ? Math.max(...vals.map(v => new Date(v).getTime())) : 0;
        };
        cmp = ts(b) - ts(a);
      }
      else if (sortKey === "issues")   cmp = b.issues.length - a.issues.length;
      else if (sortKey === "severity") cmp = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return cmp * factor;
    });
  })();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function SortTh({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 whitespace-nowrap ${className ?? "text-left"}`}
        onClick={() => onSort(col)}
      >
        {label}
        {active && <span className="ml-1 text-gray-400">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </th>
    );
  }

  const countFor = (sys: IssueSystem) => rows.filter(r => r.issues.some(i => i.systems.includes(sys))).length;

  function SliceTh({ sys, label }: { sys: IssueSystem; label: string }) {
    const active = filter === sys;
    const c = SYS[sys];
    const count = countFor(sys);
    return (
      <th
        onClick={() => onSlice(active ? "all" : sys)}
        className="px-3 py-3 text-center font-semibold cursor-pointer select-none whitespace-nowrap transition-colors"
        style={{ color: c.text700, background: active ? c.bg50 : undefined }}
      >
        {label}
        <span style={{
          marginLeft: "6px",
          background: active ? c.bg100 : "#f3f4f6",
          color: active ? c.text600 : "#6b7280",
          padding: "1px 7px",
          borderRadius: "9999px",
          fontSize: "12px",
          fontWeight: 600,
        }}>
          {count}
        </span>
      </th>
    );
  }

  return (
    <>
    <table className="w-full text-sm">
      <colgroup>
        <col style={{ width: "130px" }} />
        <col style={{ width: "110px" }} />
        <col />
        <col style={{ width: "80px" }} />
        <col style={{ width: "80px" }} />
        <col style={{ width: "80px" }} />
        <col style={{ width: "160px" }} />
        <col />
      </colgroup>
      <thead className="bg-white border-b">
        <tr>
          <SortTh col="tag" label="Tag" />
          <SortTh col="severity" label="Status" />
          <SortTh col="model" label="Model" />
          <SliceTh sys="ops" label="Ops" />
          <SliceTh sys="facilities" label="Facilities" />
          <SliceTh sys="finance" label="Finance" />
          <SortTh col="last_seen" label="Last seen" />
          <SortTh col="issues" label="Issues" />
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
              No issues in this system.
            </td>
          </tr>
        ) : visible.map(row => (
          <tr key={row.asset_tag} className="group">
            <td className="px-4 py-3 group-hover:bg-gray-50">
              <TagWithTooltip row={row} />
            </td>
            <td className="px-4 py-3 group-hover:bg-gray-50 text-xs">
              <SeverityLabel severity={row.severity} />
            </td>
            <td className="px-4 py-3 group-hover:bg-gray-50">
              <p className="text-gray-800">{row.model || "—"}</p>
              {row.manufacturer && <p className="text-xs text-gray-400">{row.manufacturer}</p>}
            </td>
            {/* System columns: always tinted, deeper on row hover */}
            <td
              className="px-3 py-3 text-center"
              style={{ background: SYS.ops.bg50 }}
              onMouseEnter={e => (e.currentTarget.style.background = SYS.ops.bg100)}
              onMouseLeave={e => (e.currentTarget.style.background = SYS.ops.bg50)}
            >
              <SystemCell flag={row.ops} severity={row.severity} />
            </td>
            <td
              className="px-3 py-3 text-center"
              style={{ background: SYS.facilities.bg50 }}
              onMouseEnter={e => (e.currentTarget.style.background = SYS.facilities.bg100)}
              onMouseLeave={e => (e.currentTarget.style.background = SYS.facilities.bg50)}
            >
              <SystemCell flag={row.facilities} severity={row.severity} />
            </td>
            <td
              className="px-3 py-3 text-center"
              style={{ background: SYS.finance.bg50 }}
              onMouseEnter={e => (e.currentTarget.style.background = SYS.finance.bg100)}
              onMouseLeave={e => (e.currentTarget.style.background = SYS.finance.bg50)}
            >
              <SystemCell flag={row.finance} severity={row.severity} />
            </td>
            {/* Last seen: pill chips */}
            <td className="px-4 py-3 whitespace-nowrap group-hover:bg-gray-50">
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "4px", columnGap: "8px", alignItems: "center", fontSize: "12.5px" }}>
                {row.timestamps.ops && (
                  <>
                    <span style={{ background: SYS.ops.bg100, color: SYS.ops.text700, padding: "1px 7px", borderRadius: "4px", fontWeight: 600, fontSize: "11px", letterSpacing: "0.02em", textAlign: "center" }}>Ops</span>
                    <span className="text-gray-500">{relativeTime(row.timestamps.ops)}</span>
                  </>
                )}
                {row.timestamps.facilities && (
                  <>
                    <span style={{ background: SYS.facilities.bg100, color: SYS.facilities.text700, padding: "1px 7px", borderRadius: "4px", fontWeight: 600, fontSize: "11px", letterSpacing: "0.02em", textAlign: "center" }}>Fac</span>
                    <span className="text-gray-500">{relativeTime(row.timestamps.facilities)}</span>
                  </>
                )}
                {row.timestamps.finance && (
                  <>
                    <span style={{ background: SYS.finance.bg100, color: SYS.finance.text700, padding: "1px 7px", borderRadius: "4px", fontWeight: 600, fontSize: "11px", letterSpacing: "0.02em", textAlign: "center" }}>Fin</span>
                    <span className="text-gray-500">{relativeTime(row.timestamps.finance)}</span>
                  </>
                )}
              </div>
            </td>
            {/* Issues: ⚠ + left-edge stripe + inline system chips */}
            <td className="px-4 py-3 group-hover:bg-gray-50">
              <ul className="space-y-1.5">
                {row.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                    <IssueDot severity={issue.severity} />
                    <IssueWithTooltip issue={issue} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {totalPages > 1 && (
      <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
        <span className="text-gray-400">
          {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => onPage(currentPage - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-gray-400 text-xs">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => onPage(currentPage + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    )}
    </>
  );
}

function UnifiedIssueTableInner({ rows }: { rows: UnifiedRow[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const severityFilter = searchParams.get("rs") ?? "";
  const hideExpected = searchParams.get("he") === "1";
  const filteredRows = rows
    .filter(r => !severityFilter || r.severity === severityFilter)
    .filter(r => !hideExpected || r.severity !== "expected");

  const filter = (searchParams.get("rf") ?? "all") as SystemFilter;
  const search = searchParams.get("rq") ?? "";
  const page = Number(searchParams.get("rp") ?? "1");
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function updateParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") p.set(key, value); else p.delete(key);
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  const setFilter = (f: SystemFilter) => {
    const p = new URLSearchParams(searchParams.toString());
    if (f && f !== "all") p.set("rf", f); else p.delete("rf");
    p.delete("rp");
    router.replace(`?${p.toString()}`, { scroll: false });
  };
  const setSearch = (q: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (q) p.set("rq", q); else p.delete("rq");
    p.delete("rp");
    router.replace(`?${p.toString()}`, { scroll: false });
  };
  const setPage = (p: number) => updateParam("rp", p === 1 ? "" : String(p));
  const toggleHideExpected = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (hideExpected) p.delete("he"); else p.set("he", "1");
    p.delete("rp");
    router.replace(`?${p.toString()}`, { scroll: false });
  };

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  if (filteredRows.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">
        <strong>No issues found.</strong> All three systems agree on every asset.
      </div>
    );
  }

  function clearFilterBtn() {
    const colors: Record<string, string> = {
      ops:        "border-[#7ea2ee] bg-[#eef4ff] text-[#1e4aa8]",
      facilities: "border-[#b88ad3] bg-[#f6eefb] text-[#6f2f95]",
      finance:    "border-[#79b896] bg-[#e9f6ee] text-[#1e6f44]",
    };
    return (
      <button
        onClick={() => setFilter("all")}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs hover:opacity-80 ${colors[filter] ?? ""}`}
      >
        ✕ Clear filter
      </button>
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
      {filter !== "all" && clearFilterBtn()}
      <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
        <span><span className="text-red-500 font-bold">⚠</span> real drift</span>
        <span><span className="text-amber-500 font-bold">⚠</span> review</span>
        <span><span className="text-gray-300 font-medium">—</span> no record</span>
      </div>
      <button
        onClick={toggleHideExpected}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${hideExpected ? "border-gray-400 bg-gray-100 text-gray-700" : "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"}`}
      >
        {hideExpected ? "Expected hidden" : "Hide expected"}
      </button>
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
            {filter !== "all" && clearFilterBtn()}
            <button
              onClick={() => setExpanded(false)}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              ⊠ Collapse
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <TableContent rows={filteredRows} filter={filter} expanded={expanded} search={search} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} onSlice={setFilter} page={page} onPage={setPage} />
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {controls}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <TableContent rows={filteredRows} filter={filter} expanded={expanded} search={search} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} onSlice={setFilter} page={page} onPage={setPage} />
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
