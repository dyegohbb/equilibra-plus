"use client";
import { useTransition } from "react";
import { Spinner } from "@/components/ui/spinner";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const [pending, startTransition] = useTransition();
  return <main className="welcome-main"><div className="welcome-content"><h1>Vamos tentar de novo?</h1><p className="welcome-description">Não foi possível conectar ao seu espaço agora.</p><button className="primary-button" disabled={pending} onClick={() => startTransition(reset)}>{pending && <Spinner size="small" label="Tentando novamente" />}{pending ? "Tentando…" : "Tentar novamente"}</button></div></main>;
}
