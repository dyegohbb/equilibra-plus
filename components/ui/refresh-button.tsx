"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export function RefreshButton({
  onRefresh,
  compact = false,
}: {
  onRefresh: () => Promise<unknown>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await onRefresh();
    } catch {
      // O chamador exibe o feedback contextual da falha.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`small-button refresh-button ${compact ? "refresh-button-compact" : ""}`}
      disabled={busy}
      onClick={() => void refresh()}
      aria-label="Atualizar dados"
    >
      {busy ? (
        <>
          <Spinner size="small" label="Atualizando" />
          {!compact && "Atualizando…"}
        </>
      ) : compact ? (
        <>↻</>
      ) : (
        <>↻ Atualizar</>
      )}
    </button>
  );
}
