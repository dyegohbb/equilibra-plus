import { redirect } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.user) redirect("/app");
  return <div className="auth-shell">
    <header className="site-header"><Brand /></header>
    <main className="auth-main"><section className="auth-card">{children}</section></main>
    <footer className="site-footer"><span className="status-dot" />Um passo de cada vez. Mais equilíbrio todos os dias.</footer>
  </div>;
}
