"use client";

import { useEffect, useRef } from "react";

// bwip-js is a CommonJS module — use dynamic require inside useEffect
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bwipjs?: any;
  }
}

type BarcodeItem = {
  value: string;
  label: string;
  note: string;
};

const ASSET_BARCODES: BarcodeItem[] = [
  { value: "C0000101", label: "C0000101", note: "in_service — location mismatch vs facilities" },
  { value: "C0000104", label: "C0000104", note: "stored — missing from facilities (expected)" },
  { value: "C0000107", label: "C0000107", note: "received — ghost: missing from facilities" },
  { value: "C0000108", label: "C0000108", note: "rma_pending — ambiguous vs finance" },
  { value: "C0000109", label: "C0000109", note: "disposed — ghost in finance (state conflict)" },
  { value: "C0000112", label: "C0000112", note: "stored — stale facilities observation" },
  { value: "C9999999", label: "C9999999", note: "unknown tag — use for receive new asset" },
];

const LOCATION_BARCODES: BarcodeItem[] = [
  { value: "SF-HQ/Lab-2B/Row-A/Rack-07/U12", label: "SF-HQ › Lab-2B › Rack-07 › U12", note: "Full deploy location" },
  { value: "SF-HQ/Storage-B", label: "SF-HQ › Storage-B", note: "Storage location" },
  { value: "NY-CAMPUS/Dock-A", label: "NY-CAMPUS › Dock-A", note: "Receiving dock" },
];

const BADGE_BARCODES: BarcodeItem[] = [
  { value: "tech-mike", label: "tech-mike", note: "Transfer recipient badge" },
  { value: "manager-paul", label: "manager-paul", note: "Manager badge" },
];

function BarcodeCanvas({ value, id }: { value: string; id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("bwip-js").then(bwipjs => {
      if (cancelled || !canvasRef.current) return;
      try {
        bwipjs.toCanvas(canvasRef.current, {
          bcid: "code128",
          text: value,
          scale: 3,
          height: 12,
          includetext: true,
          textxalign: "center",
        });
      } catch {
        // fallback: render as QR if code128 fails for long values
        try {
          bwipjs.toCanvas(canvasRef.current, {
            bcid: "qrcode",
            text: value,
            scale: 4,
          });
        } catch {
          // silently skip
        }
      }
    });
    return () => { cancelled = true; };
  }, [value]);

  return <canvas ref={canvasRef} id={id} className="max-w-full" />;
}

function BarcodeGroup({ title, items }: { title: string; items: BarcodeItem[] }) {
  return (
    <section className="space-y-4 print:break-inside-avoid">
      <h2 className="font-semibold text-gray-800 border-b pb-2">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {items.map(item => (
          <div key={item.value} className="border rounded-lg p-4 space-y-2 print:border-gray-400">
            <BarcodeCanvas value={item.value} id={`bc-${item.value}`} />
            <p className="font-mono text-xs text-gray-700">{item.label}</p>
            <p className="text-xs text-gray-400">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function DevBarcodesPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold">Dev: Scannable barcodes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Code 128 barcodes for the interesting asset cases and test locations. Print or scan from screen.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Print
        </button>
      </div>

      <BarcodeGroup title="Assets — interesting cases" items={ASSET_BARCODES} />
      <BarcodeGroup title="Locations (for store / deploy)" items={LOCATION_BARCODES} />
      <BarcodeGroup title="Badges (for transfer custody)" items={BADGE_BARCODES} />

      <style>{`
        @media print {
          .no-print { display: none; }
          body { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
