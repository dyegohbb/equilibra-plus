export function Spinner({ label = "Carregando", size = "medium" }: { label?: string; size?: "small" | "medium" | "large" }) {
  return <span className={`spinner spinner-${size}`} role="status" aria-label={label}><span className="sr-only">{label}</span></span>;
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><Spinner size="large" label={label} /><span>{label}</span></div>;
}
