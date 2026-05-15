"use client";

import { useEffect, useRef, useState } from "react";

export interface ScanInputProps {
  onScan: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  label?: string;
  showButton?: boolean;
  buttonLabel?: string;
  isValid?: (value: string) => boolean;
}

export function ScanInput({
  onScan,
  onValueChange,
  placeholder = "Scan or type a tag and press Enter…",
  autoFocus = true,
  disabled = false,
  label,
  showButton = false,
  buttonLabel = "Next",
  isValid,
}: ScanInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (autoFocus && ref.current && !disabled) {
      ref.current.focus();
    }
  }, [autoFocus, disabled]);

  function fire(): void {
    const v = draft.trim();
    if (!v) return;
    onScan(v);
    setDraft("");
    ref.current?.focus();
  }

  const valid = isValid ? isValid(draft.trim()) : draft.trim().length > 0;

  return (
    <label className="block">
      {label ? (
        <span className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </span>
      ) : null}
      <input
        ref={ref}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={e => { setDraft(e.target.value); onValueChange?.(e.target.value); }}
        className="w-full text-lg p-4 min-h-[44px] rounded-lg border-2 border-gray-300 focus:border-blue-600 focus:outline-none disabled:bg-gray-100"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            fire();
          }
        }}
      />
      {showButton && (
        <button
          type="button"
          onClick={fire}
          disabled={disabled || !valid}
          className="mt-3 w-full rounded-lg px-4 py-3 text-sm font-medium min-h-[44px] transition-colors
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
            enabled:bg-blue-600 enabled:text-white enabled:hover:bg-blue-700"
        >
          {buttonLabel}
        </button>
      )}
    </label>
  );
}
