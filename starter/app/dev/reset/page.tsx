"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";

export default function DevResetPage() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [reseededAt, setReseededAt] = useState("");

  async function handleReset() {
    setState("loading");
    try {
      const result = await api.reset();
      setReseededAt(result.reseeded_at);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dev: Reset database</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Wipes all scans and re-seeds ~1,000 starter assets. Facilities and finance overlays are also cleared.
          Run before recording your Loom.
        </p>
      </div>

      {state === "done" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Database reset at {new Date(reseededAt).toLocaleString()}.
        </div>
      )}
      {state === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Reset failed. Is the API running on :8080?
        </div>
      )}

      <button
        onClick={handleReset}
        disabled={state === "loading"}
        className="w-full rounded-lg bg-red-600 px-4 py-3 font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "loading" ? "Resetting…" : "Reset database"}
      </button>

      <p className="text-xs text-gray-400">This page is not linked from any production surface.</p>
    </div>
  );
}
