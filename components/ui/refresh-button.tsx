"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export function RefreshButton({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="small-button refresh-button" disabled={busy} onClick={() => void refresh()}>
      {busy ? <><Spinner size="small" label="Atualizando" /> Atualizando…</> : <>↻ Atualizar</>}
    </button>
  );
}
