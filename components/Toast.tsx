"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  variant?: "success" | "error" | "info";
  onClose: () => void;
  durationMs?: number;
};

const VARIANT_STYLES: Record<NonNullable<ToastProps["variant"]>, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function Toast({
  message,
  variant = "info",
  onClose,
  durationMs = 2400,
}: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onClose();
    }, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex items-center justify-center px-4">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-lg backdrop-blur ${VARIANT_STYLES[variant]}`}
        role="status"
        aria-live="polite"
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-black/10 bg-white/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 hover:text-zinc-900"
        >
          Close
        </button>
      </div>
    </div>
  );
}
