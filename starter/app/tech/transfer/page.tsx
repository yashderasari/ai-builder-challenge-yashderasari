"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanInput } from "@/components/ScanInput";
import { CameraScanInput } from "@/components/CameraScanInput";
import { ScanFeedback } from "@/components/ScanFeedback";
import { AssetCard } from "@/components/AssetCard";
import { api } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { classifyError } from "@/lib/scan-error";
import type { Asset } from "@/lib/types";

type Step = "scan_asset" | "scan_badge" | "result";
type ScanMode = "keyboard" | "camera";

export default function TechTransferPage() {
  const [step, setStep] = useState<Step>("scan_asset");
  const [scanMode, setScanMode] = useState<ScanMode>("keyboard");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [toCustodian, setToCustodian] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "loading" | "error">("idle");
  const [feedbackCode, setFeedbackCode] = useState("");
  const [result, setResult] = useState<Asset | null>(null);

  const fromUser = getCurrentUserId();

  async function handleAssetScan(tag: string) {
    if (!/^C\d{7}$/.test(tag)) {
      setFeedback("error");
      setFeedbackCode("invalid_tag_format");
      return;
    }
    setFeedback("loading");
    try {
      const found = await api.assets.get(tag);
      setAsset(found);
      setStep("scan_badge");
      setFeedback(found.state === "disposed" ? "error" : "idle");
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
    }
  }

  async function handleBadgeScan(badge: string) {
    if (!asset) return;

    if (/^C\d{7}$/.test(badge)) {
      setFeedback("error");
      setFeedbackCode("badge_is_asset_tag");
      return;
    }
    if (badge === fromUser || badge === asset.custodian) {
      setFeedback("error");
      setFeedbackCode("same_custodian");
      return;
    }

    setToCustodian(badge);
    setFeedback("loading");

    try {
      const updated = await api.scans.transfer({
        asset_tag: asset.asset_tag,
        to_custodian: badge,
        user_id: fromUser,
        scan_payload: badge,
      });
      setResult(updated);
      setStep("result");
      setFeedback("idle");
    } catch (err) {
      setFeedback("error");
      setFeedbackCode(classifyError(err));
    }
  }

  function reset() {
    setStep("scan_asset");
    setAsset(null);
    setResult(null);
    setToCustodian("");
    setFeedback("idle");
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer custody</h1>
        <p className="text-gray-500 text-sm mt-1">Scan the asset, then scan the new owner's badge.</p>
      </div>

      {/* Mode toggle — shown on first step only */}
      {step === "scan_asset" && (
        <div className="flex gap-2 text-sm">
          <button onClick={() => setScanMode("keyboard")} className={`px-3 py-1.5 rounded-full border ${scanMode === "keyboard" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>Keyboard / scanner</button>
          <button onClick={() => setScanMode("camera")} className={`px-3 py-1.5 rounded-full border ${scanMode === "camera" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600"}`}>Camera</button>
        </div>
      )}

      {/* Step 1: scan the asset */}
      {step === "scan_asset" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
            <span className="font-medium">From:</span> {fromUser}
          </div>
          {scanMode === "keyboard" ? (
            <ScanInput onScan={handleAssetScan} onValueChange={() => setFeedback("idle")} label="Asset tag" placeholder="Scan or type asset tag…" showButton buttonLabel="Next" isValid={v => /^C\d{7}$/.test(v)} />
          ) : (
            <CameraScanInput onScan={handleAssetScan} label="Scan asset barcode" />
          )}
          <ScanFeedback
            state={feedback === "loading" ? "loading" : feedback === "error" ? "error" : "idle"}
            errorCode={feedbackCode}
            errorAction={feedbackCode === "unknown_asset" ? <>Go to <Link href="/tech/receive" className="underline font-medium">Receive</Link> to register it first, then come back.</> : undefined}
          />
        </div>
      )}

      {/* Step 2: confirm asset, scan badge */}
      {step === "scan_badge" && asset && (() => {
        const blocked = asset.state === "disposed";
        return (
        <div className="space-y-4">
          <AssetCard asset={asset} heading="Transferring" />

          {blocked ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>This asset has been disposed.</strong> It can't be transferred. Double-check you scanned the right barcode.
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-medium">From</p>
                    <p className="font-medium text-gray-800">{fromUser}</p>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase font-medium">To</p>
                    <p className={`font-medium ${toCustodian ? "text-gray-800" : "text-gray-400"}`}>
                      {toCustodian || "Scan badge…"}
                    </p>
                  </div>
                </div>
              </div>

              <ScanFeedback state={feedback === "loading" ? "loading" : feedback === "error" ? "error" : "idle"} errorCode={feedbackCode} />

              {scanMode === "keyboard" ? (
                <ScanInput onScan={handleBadgeScan} label="Receiving person's badge" placeholder="Scan badge ID (e.g. tech-mike)…" disabled={feedback === "loading"} />
              ) : (
                <CameraScanInput onScan={handleBadgeScan} disabled={feedback === "loading"} label="Scan recipient's badge" />
              )}
            </>
          )}

          <button type="button" onClick={reset} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 min-h-[44px]">
            Cancel — scan different asset
          </button>
        </div>
        );
      })()}

      {/* Result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <AssetCard asset={result} />
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <span className="text-green-600 text-xl leading-none">✓</span>
              <div className="space-y-1">
                <p className="font-medium text-green-900">
                  <span className="font-mono">{result.asset_tag}</span> is now in <span className="font-medium">{toCustodian}</span>&apos;s custody.
                </p>
                <p className="text-sm text-green-700">
                  Made a mistake?{" "}
                  <button onClick={reset} className="underline font-medium">Transfer again</button>{" "}
                  to reassign it to the right person.
                </p>
              </div>
            </div>
          </div>
          <button onClick={reset} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]">Transfer another</button>
        </div>
      )}
    </div>
  );
}
