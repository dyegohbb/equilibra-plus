import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { Brand } from "@/components/ui/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu espaço" };

export default async function AppPage() {
  const session = await getSession();
  if (!session?.user) redirect("/sign-in");
  return <div className="auth-shell">
    <header className="site-header"><Brand /></header>
    <main className="welcome-main">
      <div className="welcome-content">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">SEU ESPAÇO ESTÁ PRONTO</p>
        <h1>Hello World</h1>
        <p className="welcome-description">Autenticação concluída com sucesso.</p>
        <p className="user-email">{session.user.email}</p>
        <SignOutButton />
      </div>
    </main>
  </div>;
}
