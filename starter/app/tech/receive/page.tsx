"use client";

import { useState, useRef } from "react";
import { ScanInput } from "@/components/ScanInput";
import { CameraScanInput } from "@/components/CameraScanInput";
import { ScanFeedback } from "@/components/ScanFeedback";
import { StateBadge } from "@/components/StateBadge";
import type { Asset } from "@/lib/types";
import { getCurrentUserId } from "@/lib/auth";
import { classifyError } from "@/lib/scan-error";
import { api } from "@/lib/api-client";
import type { AssetClass, Location } from "@/lib/types";
import { CLASS_LABELS } from "@/lib/format";

type Step = "scan_tag" | "fill_form" | "result";
type FeedbackState = "idle" | "loading" | "success" | "error";
type ScanMode = "keyboard" | "camera";

const ASSET_CLASSES: AssetClass[] = [
  "instrument", "compute", "network", "power", "consumable_durable",
];

const emptyLocation: Location = { site: "", room: null, row: null, rack: null, ru: null };

export default function TechReceivePage() {
  const [step, setStep] = useState<Step>("scan_tag");
  const [scanMode, setScanMode] = useState<ScanMode>("keyboard");
  const [feedback, setFeedback] = useState<FeedbackState>("idle");
  const [feedbackCode, setFeedbackCode] = useState("");
  const [feedbackDetail, setFeedbackDetail] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [successDetail, setSuccessDetail] = useState("");

  // form state
  const [tag, setTag] = useState("");
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("instrument");
  const [location, setLocation] = useState<Location>(emptyLocation);
  const [existingAsset, setExistingAsset] = useState<Asset | null>(null);
  const [conflictSerial, setConflictSerial] = useState<{ scanned: string; existing: string } | null>(null);

  const serialRef = useRef<HTMLInputElement>(null);

  async function handleTagScan(value: string) {
    if (!/^C\d{7}$/.test(value)) {
      setFeedback("error");
      setFeedbackCode("invalid_tag_format");
      return;
    }
    setFeedback("loading");
    setConflictSerial(null);
    setExistingAsset(null);

    try {
      const found = await api.assets.get(value);
      // Asset exists — check state before showing the form
      if (found.state === "disposed") {
        setExistingAsset(found);
        setStep("result");
        setFeedback("error");
        return;
      }
      if (found.state === "rma_pending") {
        setExistingAsset(found);
        setStep("result");
        setFeedback("idle");
        return;
      }
      // For all other existing states, pre-fill and show the form (duplicate receive path)
      setTag(value);
      setFeedback("idle");
      setStep("fill_form");
      setTimeout(() => serialRef.current?.focus(), 50);
    } catch (err: unknown) {
      const code = classifyError(err);
      if (code === "unknown_asset") {
        // Tag not in system — this is a new asset, show the form
        setTag(value);
        setFeedback("idle");
        setStep("fill_form");
        setTimeout(() => serialRef.current?.focus(), 50);
      } else {
        setFeedback("error");
        setFeedbackCode(code);
      }
    }
  }

  function reset() {
    setStep("scan_tag");
    setFeedback("idle");
    setTag("");
    setSerial("");
    setModel("");
    setManufacturer("");
    setAssetClass("instrument");
    setLocation(emptyLocation);
    setExistingAsset(null);
    setConflictSerial(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback("loading");
    setConflictSerial(null);

    try {
      // Use raw fetch so we can read the HTTP status code.
      // 201 = new asset created; 200 = duplicate receive (same serial, idempotent).
      // The api.scans.receive() wrapper doesn't expose status, so we go direct.
      const res = await fetch("/api/upstream/scans/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_tag: tag,
          serial,
          model,
          manufacturer,
          asset_class: assetClass,
          location,
          user_id: getCurrentUserId(),
          scan_payload: tag,
        }),
      });

      const data = await res.json() as Asset | { error: { code: string; message: string; details?: Record<string, unknown> } };

      if (!res.ok) {
        const errData = data as { error: { code: string; message: string; details?: Record<string, unknown> } };
        if (errData.error?.code === "and_match_failed") {
          const existing = (errData.error.details?.expected_serial ?? errData.error.details?.existing_serial) as string | undefined;
          setConflictSerial({ scanned: serial, existing: existing ?? "(unknown)" });
          setFeedback("error");
          setFeedbackCode("and_match_failed");
          setFeedbackDetail(`You scanned serial ${serial}, but this tag is registered to serial ${existing ?? "unknown"}.`);
        } else {
          setFeedback("error");
          setFeedbackCode(errData.error?.code ?? "unknown_error");
          setFeedbackDetail("");
        }
        return;
      }

      const result = data as Asset;
      const isNew = res.status === 201;
      if (!isNew && result.state === "rma_pending") {
        // Duplicate receive on an rma_pending asset logs an event but doesn't change state.
        // The tech needs to know this didn't "fix" the RMA — it's still out for repair.
        setSuccessMessage("Logged — but this asset is still out for RMA");
        setSuccessDetail(`${result.manufacturer} ${result.model} · ${result.serial} is marked as RMA pending. This scan was recorded, but the asset status hasn't changed. Ask your manager to process the RMA return.`);
      } else {
        setSuccessMessage(isNew ? `Received ${tag}` : "Already registered — recorded as duplicate receive");
        setSuccessDetail(isNew
          ? `${manufacturer} ${model} is now in receiving.`
          : `${result.manufacturer} ${result.model} · ${result.serial} is already in the system (${result.state}).`
        );
      }
      setExistingAsset(result);
      setStep("result");
      setFeedback((!isNew && result.state === "rma_pending") ? "error" : "success");
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
      setFeedbackDetail("");
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receive asset</h1>
        <p className="text-gray-500 text-sm mt-1">Scan the barcode on the incoming asset.</p>
      </div>

      {step === "scan_tag" && (
        <div className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => setScanMode("keyboard")}
              className={`px-3 py-1.5 rounded-full border ${scanMode === "keyboard" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}
            >
              Keyboard / scanner
            </button>
            <button
              onClick={() => setScanMode("camera")}
              className={`px-3 py-1.5 rounded-full border ${scanMode === "camera" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}
            >
              Camera
            </button>
          </div>

          {scanMode === "keyboard" ? (
            <ScanInput onScan={handleTagScan} onValueChange={() => setFeedback("idle")} label="Asset tag" placeholder="Scan or type tag (e.g. C0001234)…" showButton buttonLabel="Next" isValid={v => /^C\d{7}$/.test(v)} />
          ) : (
            <CameraScanInput onScan={handleTagScan} />
          )}
          {feedback === "error" && <ScanFeedback state="error" errorCode={feedbackCode} />}
        </div>
      )}

      {step === "fill_form" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-gray-50 p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Asset tag</p>
              <p className="font-mono font-semibold">{tag}</p>
            </div>
            <button type="button" onClick={reset} className="text-sm text-blue-600 hover:underline">
              Change
            </button>
          </div>

          {conflictSerial && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <p className="font-medium text-red-900">Serial number mismatch</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded bg-red-100 p-2">
                  <p className="text-xs text-red-500 font-medium uppercase">You scanned</p>
                  <p className="font-mono text-red-900">{conflictSerial.scanned}</p>
                </div>
                <div className="rounded bg-white border border-red-200 p-2">
                  <p className="text-xs text-red-500 font-medium uppercase">Registered to</p>
                  <p className="font-mono text-red-900">{conflictSerial.existing}</p>
                </div>
              </div>
              <p className="text-xs text-red-600">Verify you have the right instrument, then contact your manager if this persists.</p>
            </div>
          )}

          {!conflictSerial && feedback === "error" && (
            <ScanFeedback state="error" errorCode={feedbackCode} errorDetail={feedbackDetail} />
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial number</label>
              <input
                ref={serialRef}
                required
                value={serial}
                onChange={e => setSerial(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                placeholder="e.g. SN-XYZ-001"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                <input
                  required
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  placeholder="e.g. Illumina"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  required
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  placeholder="e.g. NovaSeq 6000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asset class</label>
              <select
                value={assetClass}
                onChange={e => setAssetClass(e.target.value as AssetClass)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none bg-white"
              >
                {ASSET_CLASSES.map(c => (
                  <option key={c} value={c}>{CLASS_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700">Receiving location</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Site <span className="text-red-500">*</span></label>
                  <input
                    required
                    value={location.site}
                    onChange={e => setLocation(l => ({ ...l, site: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    placeholder="e.g. SF-HQ"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Room</label>
                  <input
                    value={location.room ?? ""}
                    onChange={e => setLocation(l => ({ ...l, room: e.target.value || null }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                    placeholder="e.g. Dock-A"
                  />
                </div>
              </div>
            </fieldset>
          </div>

          <button
            type="submit"
            disabled={feedback === "loading"}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]"
          >
            {feedback === "loading" ? "Receiving…" : "Receive asset"}
          </button>
        </form>
      )}

      {step === "result" && existingAsset && (
        <div className="space-y-4">
          {existingAsset.state === "rma_pending" ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <span className="text-amber-500 text-xl leading-none">!</span>
                <div className="space-y-1">
                  <p className="font-medium text-amber-900">This asset is out for RMA</p>
                  <p className="text-sm text-amber-800">{existingAsset.manufacturer} {existingAsset.model} · {existingAsset.serial} is marked RMA pending — it's with the vendor for repair.</p>
                  <p className="text-sm text-amber-800">Ask your manager to process the RMA return. Once received back, you'll be able to store or deploy it.</p>
                </div>
              </div>
            </div>
          ) : existingAsset.state === "disposed" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <span className="text-red-600 text-xl leading-none">✕</span>
                <div className="space-y-1">
                  <p className="font-medium text-red-900">This asset has been disposed</p>
                  <p className="text-sm text-red-700">{existingAsset.manufacturer} {existingAsset.model} · {existingAsset.serial} is permanently retired and can't re-enter the system.</p>
                  <p className="text-sm text-red-700">Double-check you scanned the right barcode. If this is a brand-new unit, it needs its own asset tag.</p>
                </div>
              </div>
            </div>
          ) : (
            <ScanFeedback state="success" successMessage={successMessage} successDetail={successDetail} />
          )}
          <div className="rounded-lg border bg-white p-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase">Asset</p>
            <div className="flex items-center justify-between">
              <p className="font-mono font-semibold">{existingAsset.asset_tag}</p>
              <StateBadge state={existingAsset.state} />
            </div>
            <p className="text-sm text-gray-700">{existingAsset.manufacturer} {existingAsset.model} · {existingAsset.serial}</p>
          </div>
          <button
            onClick={reset}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
          >
            Receive another
          </button>
        </div>
      )}
    </div>
  );
}
