"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanInput } from "@/components/ScanInput";
import { CameraScanInput } from "@/components/CameraScanInput";
import { ScanFeedback } from "@/components/ScanFeedback";
import { AssetCard } from "@/components/AssetCard";
import { InQueue } from "@/components/InQueue";
import { api } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { classifyError, classifyRouteError } from "@/lib/scan-error";
import { parseLocationBarcode } from "@/lib/format";
import type { Asset, Location } from "@/lib/types";

type Step = "scan_tag" | "fill_location" | "result";
type ScanMode = "keyboard" | "camera";

const emptyLoc: Location = { site: "", room: null, row: null, rack: null, ru: null };

function isDeployLocationComplete(loc: Location): boolean {
  return !!(loc.site && loc.room && loc.rack && loc.ru);
}

function TechDeployContent() {
  const [step, setStep] = useState<Step>("scan_tag");
  const [scanMode, setScanMode] = useState<ScanMode>("keyboard");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [location, setLocation] = useState<Location>(emptyLoc);
  const [feedback, setFeedback] = useState<"idle" | "loading" | "error">("idle");
  const [feedbackCode, setFeedbackCode] = useState("");
  const [result, setResult] = useState<Asset | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locScanOpen, setLocScanOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const tagFromUrl = useSearchParams().get("tag") ?? "";

  useEffect(() => {
    if (tagFromUrl) handleTagScan(tagFromUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFromUrl]);

  async function handleTagScan(tag: string) {
    if (!/^C\d{7}$/.test(tag)) {
      setFeedback("error");
      setFeedbackCode("invalid_tag_format");
      return;
    }
    setFeedback("loading");
    try {
      const found = await api.assets.get(tag);
      setAsset(found);
      setLocation(emptyLoc);
      setStep("fill_location");
      setFeedback("idle");
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
    }
  }

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;

    if (!isDeployLocationComplete(location)) {
      setLocationError("Site, room, rack, and rack unit (RU) are all required to deploy.");
      return;
    }
    setLocationError("");
    setFeedback("loading");

    try {
      const res = await fetch("/api/scans/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_tag: asset.asset_tag,
          location,
          user_id: getCurrentUserId(),
          scan_payload: asset.asset_tag,
        }),
      });
      const data = await res.json() as { asset?: Asset; error?: { code: string; message: string } };
      if (!res.ok || !data.asset) {
        setFeedback("error");
        setFeedbackCode(classifyRouteError(data));
        return;
      }
      setResult(data.asset);
      setStep("result");
      setFeedback("idle");
      setRefreshKey(k => k + 1);
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
    }
  }

  function reset() {
    setStep("scan_tag");
    setAsset(null);
    setResult(null);
    setFeedback("idle");
    setLocation(emptyLoc);
    setLocationError("");
  }

  return (
    <div className="max-w-7xl">
      <div className="lg:grid lg:grid-cols-[360px_1fr] lg:gap-8">
      <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Deploy asset</h1>
        <p className="text-gray-500 text-sm mt-1">Scan the asset you're racking into service.</p>
      </div>

      {step === "scan_tag" && (
        <div className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button onClick={() => setScanMode("keyboard")} className={`px-3 py-1.5 rounded-full border ${scanMode === "keyboard" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>Keyboard / scanner</button>
            <button onClick={() => setScanMode("camera")} className={`px-3 py-1.5 rounded-full border ${scanMode === "camera" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>Camera</button>
          </div>
          {scanMode === "keyboard" ? (
            <ScanInput onScan={handleTagScan} onValueChange={() => setFeedback("idle")} label="Asset tag" placeholder="Scan or type tag…" showButton buttonLabel="Next" isValid={v => /^C\d{7}$/.test(v)} />
          ) : (
            <CameraScanInput onScan={handleTagScan} />
          )}
          <ScanFeedback
            state={feedback === "loading" ? "loading" : feedback === "error" ? "error" : "idle"}
            errorCode={feedbackCode}
            errorAction={feedbackCode === "unknown_asset" ? <>Go to <Link href="/tech/receive" className="underline font-medium">Receive</Link> to register it first, then come back.</> : undefined}
          />
        </div>
      )}

      {step === "fill_location" && asset && (() => {
        const blocked = ["in_service", "rma_pending", "disposed", "unreceived"].includes(asset.state);
        return (
        <form onSubmit={handleDeploy} className="space-y-4">
          <AssetCard asset={asset} heading="Asset to deploy" />

          {asset.state === "in_service" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-2">
              <p>
                <strong>Already in the rack.</strong>{" "}
                This asset is live at{" "}
                <span className="font-medium">
                  {[asset.location.site, asset.location.room, asset.location.rack].filter(Boolean).join(" › ")}
                </span>.
              </p>
              <p>Moving it to a new rack? <Link href="/tech/store" className="underline font-medium">Go to Store</Link> to pull it out first, then come back here to re-deploy.</p>
              <p>Grabbed the wrong asset? Hit Cancel and scan the right one.</p>
            </div>
          )}
          {asset.state === "rma_pending" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Out for repair (RMA).</strong> This asset can't be deployed until it's returned and{" "}
              <Link href="/tech/receive" className="underline font-medium">received back</Link>{" "}
              into the system.
            </div>
          )}
          {asset.state === "unreceived" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Not received yet.</strong> This asset hasn't entered the system.{" "}
              <Link href="/tech/receive" className="underline font-medium">Go to Receive</Link>{" "}
              to register it first, then come back to deploy it.
            </div>
          )}
          {asset.state === "disposed" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>This asset has been disposed.</strong> It can't be re-deployed. Double-check you scanned the right barcode.
            </div>
          )}

          {locationError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{locationError}</div>
          )}
          {!["in_service", "rma_pending", "disposed"].includes(asset.state) && (
            <ScanFeedback state={feedback === "error" ? "error" : "idle"} errorCode={feedbackCode} />
          )}

          <fieldset disabled={blocked} className={`space-y-3 ${blocked ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium text-gray-700">Rack location <span className="text-red-500 text-xs font-normal">All fields required</span></legend>
              <button type="button" onClick={() => setLocScanOpen(o => !o)} className="text-xs text-blue-600 underline">
                {locScanOpen ? "Enter manually" : "Scan location barcode"}
              </button>
            </div>
            {locScanOpen && (
              <CameraScanInput
                label="Scan location barcode"
                onScan={raw => {
                  const parsed = parseLocationBarcode(raw);
                  if (parsed) { setLocation(l => ({ ...l, ...parsed })); setLocScanOpen(false); }
                }}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Site <span className="text-red-500">*</span></label>
                <input required value={location.site} onChange={e => setLocation(l => ({ ...l, site: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. SF-HQ" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Room <span className="text-red-500">*</span></label>
                <input required value={location.room ?? ""} onChange={e => setLocation(l => ({ ...l, room: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. Lab-2B" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Row</label>
                <input value={location.row ?? ""} onChange={e => setLocation(l => ({ ...l, row: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. Row-A" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rack <span className="text-red-500">*</span></label>
                <input required value={location.rack ?? ""} onChange={e => setLocation(l => ({ ...l, rack: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. Rack-07" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rack unit (RU) <span className="text-red-500">*</span></label>
                <input required value={location.ru ?? ""} onChange={e => setLocation(l => ({ ...l, ru: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. U12" />
              </div>
            </div>
          </fieldset>

          <div className="flex gap-3">
            <button type="button" onClick={reset} className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Cancel</button>
            <button type="submit" disabled={blocked || feedback === "loading"} className="flex-1 rounded-lg bg-green-700 px-4 py-3 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              {feedback === "loading" ? "Deploying…" : "Deploy to rack"}
            </button>
          </div>
        </form>
        );
      })()}

      {step === "result" && result && (
        <div className="space-y-4">
          <AssetCard asset={result} />
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-green-600 text-xl leading-none">✓</span>
              <div className="space-y-1">
                <p className="font-medium text-green-900">
                  <span className="font-mono">{result.asset_tag}</span> is now deployed at{" "}
                  <span className="font-mono text-sm">{[result.location.site, result.location.room, result.location.rack, result.location.ru ? `RU ${result.location.ru}` : null].filter(Boolean).join(" › ")}</span>.
                </p>
                <p className="text-sm text-green-700">
                  Made a mistake?{" "}
                  <Link href="/tech/store" className="underline font-medium">Go to Store</Link>{" "}
                  to pull it out, then re-deploy it to the correct rack.
                </p>
              </div>
            </div>
          </div>
          <button onClick={reset} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Deploy another</button>
        </div>
      )}
      </div>{/* end main column */}

      <div className="mt-8 lg:mt-0">
        <InQueue
          filterState={["stored", "received"]}
          nextStep="deploy"
          refreshKey={refreshKey}
          currentTag={asset?.asset_tag}
        />
      </div>
      </div>{/* end grid */}
    </div>
  );
}

export default function TechDeployPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl animate-pulse h-96 rounded-lg bg-gray-100" />}>
      <TechDeployContent />
    </Suspense>
  );
}
