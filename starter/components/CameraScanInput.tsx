"use client";

import { useEffect, useRef, useState } from "react";

type ScanControls = { stop: () => void };

type Props = {
  onScan: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

export function CameraScanInput({ onScan, disabled, label }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScanControls | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  async function start() {
    setStatus("starting");
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result, err) => {
          if (result) {
            const text = result.getText();
            controlsRef.current?.stop();
            controlsRef.current = null;
            setStatus("idle");
            onScan(text);
          }
          if (err) {
            // @zxing fires NotFoundException continuously while scanning — suppress it
            const name = (err as Error).name ?? "";
            if (!name.includes("NotFoundException") && !name.includes("FormatException")) {
              console.warn("zxing scan error:", err);
            }
          }
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Camera unavailable";
      setErrorMsg(
        msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("NotFoundError")
          ? "Camera permission denied. Enable camera access in your browser settings."
          : "Could not start camera. Make sure no other app is using it.",
      );
      setStatus("error");
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  }

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        className={`w-full rounded-lg bg-black aspect-video object-cover ${status === "scanning" ? "block" : "hidden"}`}
        muted
        playsInline
      />

      {status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {status === "scanning" ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 text-center">Point the camera at a barcode or QR code</p>
          <button
            type="button"
            onClick={stop}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || status === "starting"}
          aria-label="Scan with camera"
          className="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
          {status === "starting" ? "Starting camera…" : (label ?? "Scan with camera")}
        </button>
      )}
    </div>
  );
}
