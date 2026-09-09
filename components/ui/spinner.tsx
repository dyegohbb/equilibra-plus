"use client";

import { createPortal } from "react-dom";

export function Spinner({ label = "Carregando", size = "medium" }: { label?: string; size?: "small" | "medium" | "large" }) {
  return <span className={`spinner spinner-${size}`} role="status" aria-label={label}><span className="sr-only">{label}</span></span>;
}

export function LoadingState({ label }: { label: string }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="loading-overlay" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-modal">
        <Spinner size="large" label={label} />
        <strong>{label}</strong>
        <span>Aguarde só um instante.</span>
      </div>
    </div>,
    document.body,
  );
}
