"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Toast from "@/components/Toast";

type ToastPayload = {
  message: string;
  variant?: "success" | "error" | "info";
  durationMs?: number;
};

type ToastContextValue = {
  showToast: (toast: ToastPayload) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const showToast = useCallback((next: ToastPayload) => {
    setToast(next);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          durationMs={toast.durationMs}
          onClose={() => setToast(null)}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { showToast: () => {} };
  }
  return ctx;
}
