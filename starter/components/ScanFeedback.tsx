"use client";

import { getErrorInfo } from "@/lib/errors";

type ScanFeedbackProps = {
  state: "idle" | "loading" | "success" | "error";
  successMessage?: string;
  successDetail?: string;
  errorCode?: string;
  errorDetail?: string;
  errorAction?: React.ReactNode;
};

export function ScanFeedback({
  state,
  successMessage,
  successDetail,
  errorCode,
  errorDetail,
  errorAction,
}: ScanFeedbackProps) {
  if (state === "idle") return null;

  if (state === "loading") {
    return (
      <div className="rounded-lg border bg-gray-50 p-4 flex items-center gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        <span className="text-gray-600 text-sm">Processing…</span>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-green-600 text-xl leading-none">✓</span>
          <div>
            <p className="font-medium text-green-900">{successMessage ?? "Done"}</p>
            {successDetail && (
              <p className="text-sm text-green-700 mt-0.5">{successDetail}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const info = getErrorInfo(errorCode ?? "unknown_error");
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-red-600 text-xl leading-none">✕</span>
        <div className="space-y-1">
          <p className="font-medium text-red-900">{info.title}</p>
          <p className="text-sm text-red-700">{errorDetail ?? info.detail}</p>
          <p className="text-sm text-red-700">{errorAction ?? info.action}</p>
        </div>
      </div>
    </div>
  );
}
