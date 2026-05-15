"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanInput } from "@/components/ScanInput";
import { CameraScanInput } from "@/components/CameraScanInput";
import { ScanFeedback } from "@/components/ScanFeedback";
import { AssetCard } from "@/components/AssetCard";
import { api } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { classifyError, classifyRouteError } from "@/lib/scan-error";
import type { Asset, Location } from "@/lib/types";

type Step = "scan_tag" | "confirm_location" | "result";
type ScanMode = "keyboard" | "camera";

export default function TechStorePage() {
  const [step, setStep] = useState<Step>("scan_tag");
  const [scanMode, setScanMode] = useState<ScanMode>("keyboard");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [location, setLocation] = useState<Location>({ site: "", room: null, row: null, rack: null, ru: null });
  const [feedback, setFeedback] = useState<"idle" | "loading" | "error">("idle");
  const [feedbackCode, setFeedbackCode] = useState("");
  const [result, setResult] = useState<Asset | null>(null);

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
      // Pre-fill site from current location
      setLocation({ site: found.location.site ?? "", room: null, row: null, rack: null, ru: null });
      setStep("confirm_location");
      setFeedback("idle");
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
    }
  }

  async function handleStore(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;
    setFeedback("loading");

    const fromState = asset.state;

    try {
      const res = await fetch("/api/scans/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_tag: asset.asset_tag,
          location,
          user_id: getCurrentUserId(),
          scan_payload: asset.asset_tag,
          from_state: fromState,
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
    setLocation({ site: "", room: null, row: null, rack: null, ru: null });
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Store asset</h1>
        <p className="text-gray-500 text-sm mt-1">Scan the asset you're moving to storage.</p>
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

      {step === "confirm_location" && asset && (() => {
        const blocked = ["disposed", "rma_pending", "unreceived"].includes(asset.state);
        return (
        <form onSubmit={handleStore} className="space-y-4">
          <AssetCard asset={asset} heading="Asset to store" />

          {asset.state === "disposed" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>This asset has been disposed.</strong> It can't be stored. Double-check you scanned the right barcode.
            </div>
          )}
          {asset.state === "rma_pending" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Out for repair (RMA).</strong> This asset needs to be{" "}
              <Link href="/tech/receive" className="underline font-medium">received back</Link>{" "}
              before it can be stored.
            </div>
          )}
          {asset.state === "unreceived" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Not received yet.</strong>{" "}
              <Link href="/tech/receive" className="underline font-medium">Go to Receive</Link>{" "}
              to register this asset first, then come back to store it.
            </div>
          )}

          {asset.state === "stored" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <strong>Already in storage.</strong> This will move it to the new location you enter below.
            </div>
          )}

          {!["disposed", "rma_pending", "unreceived"].includes(asset.state) && (
            <ScanFeedback state={feedback === "error" ? "error" : "idle"} errorCode={feedbackCode} />
          )}

          <fieldset disabled={blocked} className={`space-y-3 ${blocked ? "opacity-40 pointer-events-none" : ""}`}>
            <legend className="text-sm font-medium text-gray-700">Storage location</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Site <span className="text-red-500">*</span></label>
                <input required value={location.site} onChange={e => setLocation(l => ({ ...l, site: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. SF-HQ" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Room</label>
                <input value={location.room ?? ""} onChange={e => setLocation(l => ({ ...l, room: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. Storage-B" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Row</label>
                <input value={location.row ?? ""} onChange={e => setLocation(l => ({ ...l, row: e.target.value || null }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" placeholder="e.g. Row-3" />
              </div>
            </div>
          </fieldset>

          <div className="flex gap-3">
            <button type="button" onClick={reset} className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Cancel</button>
            <button type="submit" disabled={blocked || feedback === "loading"} className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
              {feedback === "loading" ? "Storing…" : "Move to storage"}
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
                  <span className="font-mono">{result.asset_tag}</span> is now in storage at{" "}
                  <span className="font-mono text-sm">{[result.location.site, result.location.room, result.location.row].filter(Boolean).join(" › ")}</span>.
                </p>
                <p className="text-sm text-green-700">
                  Ready to rack it?{" "}
                  <Link href="/tech/deploy" className="underline font-medium">Go to Deploy</Link>{" "}
                  to put it into service.
                </p>
              </div>
            </div>
          </div>
          <button onClick={reset} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Store another</button>
        </div>
      )}
    </div>
  );
}
