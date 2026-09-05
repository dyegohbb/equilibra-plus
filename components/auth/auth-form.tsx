"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/client";

type Status = "idle" | "loading" | "success" | "error";

export function AuthForm({ mode, available }: { mode: "sign-in" | "sign-up"; available: boolean }) {
  const signUp = mode === "sign-up";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const busy = status === "loading" || status === "success";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !available) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (signUp && password !== form.get("confirm-password")) {
      setStatus("error");
      setMessage("As senhas não coincidem. Confira e tente novamente.");
      return;
    }
    submitting.current = true;
    setStatus("loading");
    setMessage("");
    try {
      const result = signUp
        // O SDK exige nome; reutilize o e-mail sem acrescentar um campo ao cadastro.
        ? await authClient.signUp.email({ email, password, name: email })
        : await authClient.signIn.email({ email, password, rememberMe: true });
      if (result.error) {
        setStatus("error");
        setMessage(signUp ? "Não foi possível criar sua conta. Verifique os dados ou tente entrar se já possui uma conta." : "Não foi possível entrar com essas credenciais. Verifique os dados e tente novamente.");
        return;
      }
      const session = await authClient.getSession({ query: { disableCookieCache: true } });
      if (session.error) {
        setStatus("error");
        setMessage("Não foi possível confirmar sua sessão. Tente entrar novamente.");
        return;
      }
      setStatus("success");
      if (session.data?.user) {
        setMessage("Tudo certo. Abrindo sua área…");
        window.location.replace("/app");
      } else {
        setMessage(signUp ? "Conta criada. Verifique seu e-mail, se solicitado, e entre para continuar." : "Não foi possível iniciar sua sessão. Tente entrar novamente.");
        if (!signUp) setStatus("error");
      }
    } catch {
      setStatus("error");
      setMessage("Não foi possível conectar. Tente novamente em instantes.");
    } finally {
      submitting.current = false;
    }
  }

  return <>
    <div className="form-heading">
      <p className="eyebrow">{signUp ? "SEU PRIMEIRO PASSO" : "BOM TER VOCÊ AQUI"}</p>
      <h1>{signUp ? "Crie sua conta" : "Bem-vindo de volta"}</h1>
      <p>{signUp ? "Um espaço para começar com mais equilíbrio." : "Entre para continuar no seu espaço."}</p>
    </div>
    {!available && <p role="status" className="notice">O acesso está sendo preparado. Tente novamente em breve.</p>}
    <form onSubmit={submit} aria-busy={status === "loading"}>
      <fieldset disabled={busy || !available}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="voce@exemplo.com" maxLength={254} required />
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} placeholder={signUp ? "Pelo menos 8 caracteres" : "Sua senha"} minLength={signUp ? 8 : undefined} maxLength={128} aria-describedby={signUp ? "password-hint" : undefined} required />
        {signUp && <>
          <p id="password-hint" className="input-hint">Use de 8 a 128 caracteres.</p>
          <label htmlFor="confirm-password">Confirmar senha</label>
          <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" placeholder="Repita sua senha" minLength={8} maxLength={128} required />
        </>}
        <button className="primary-button" type="submit" disabled={busy || !available}>
          {status === "loading" ? "Aguarde…" : status === "success" ? "Tudo certo" : signUp ? "Criar conta" : "Entrar"}
          <span aria-hidden="true">↗</span>
        </button>
      </fieldset>
      {message && <p className={status === "error" ? "form-message error" : "form-message success"} role={status === "error" ? "alert" : "status"}>{message}</p>}
    </form>
    <p className="switch-auth">{signUp ? "Já possui conta?" : "Ainda não possui conta?"} <Link href={signUp ? "/sign-in" : "/sign-up"}>{signUp ? "Entrar" : "Criar conta"}</Link></p>
  </>;
}
