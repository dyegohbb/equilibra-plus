"use client";

import { useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function signOut() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Logout failed");
      window.location.replace("/sign-in");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
      submitting.current = false;
      setBusy(false);
    }
  }
  return <div className="sign-out"><button className="primary-button" onClick={signOut} disabled={busy}>{busy ? "Saindo…" : "Sair"}<span aria-hidden="true">↗</span></button>{error && <p role="alert" className="form-message error">{error}</p>}</div>;
}
